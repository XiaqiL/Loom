import os
import glob
from typing import List, Tuple
import pandas as pd

import numpy as np
from PIL import Image

import streamlit as st
import torch
import torch.nn.functional as F
import timm
from timm.data import resolve_data_config, create_transform


GALLERY_DIR = "imgs"                 # 你的对比图库目录
MODEL_NAME = "mobilenetv3_small_100"    # 轻量模型，CPU 友好；想更准可换 "resnet50"

def load_rgb(path: str) -> Image.Image:
    return Image.open(path).convert("RGB")

import csv
import cv2
import numpy as np


def load_price_map(csv_path: str) -> dict:
    """
    csv: filename,price
    return: {"1.jpg": 199.0, ...}
    """
    mp = {}
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            mp[row["filename"]] = float(row["price"])
    return mp


def image_quality_metrics(pil_img) -> dict:
    """
    轻量质量指标：brightness + sharpness
    """
    # brightness
    gray = np.array(pil_img.convert("L"))
    brightness = float(gray.mean())  # 0~255

    # sharpness: Laplacian variance (越大越清晰)
    # 需要 opencv-python
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    return {"brightness": brightness, "sharpness": lap_var}


def softmax_weights(scores: np.ndarray, temperature: float = 0.1) -> np.ndarray:
    scores = scores.astype(np.float32)
    scores = scores / max(temperature, 1e-6)
    scores = scores - scores.max()
    expv = np.exp(scores)
    return expv / (expv.sum() + 1e-12)


def weighted_mean(values: np.ndarray, weights: np.ndarray) -> float:
    return float((values * weights).sum() / (weights.sum() + 1e-12))


def weighted_std(values: np.ndarray, weights: np.ndarray) -> float:
    mu = weighted_mean(values, weights)
    var = float((weights * (values - mu) ** 2).sum() / (weights.sum() + 1e-12))
    return float(np.sqrt(max(var, 0.0)))


def compute_pricing_from_similar(
    topk_results,          # List[(path, sim)]
    price_map: dict,       # {"1.jpg": 199, ...}
    temperature: float = 0.1
):
    """
    输入 TopK 相似图结果 + 价格表 -> 输出参考价、区间、置信度、用于解释的明细
    """
    # 取出有价格的项
    items = []
    for p, sim in topk_results:
        fn = os.path.basename(p)
        if fn in price_map:
            items.append((p, float(sim), float(price_map[fn])))

    if len(items) == 0:
        return None  # 没有可用价格

    sims = np.array([x[1] for x in items], dtype=np.float32)  # cosine
    # cosine -> [0,1]
    s = np.clip((sims + 1.0) / 2.0, 0.0, 1.0)

    prices = np.array([x[2] for x in items], dtype=np.float32)

    # 权重
    w = softmax_weights(s, temperature=temperature)

    p_base = weighted_mean(prices, w)
    spread = weighted_std(prices, w)

    s_top1 = float(s.max())
    s_topk = float(s.min())
    # 置信度（可解释：最像的比最不像的“拉开多少”）
    conf = (s_top1 - s_topk) / 0.30
    conf = float(np.clip(conf, 0.0, 1.0))

    # 区间：conf 越低，区间越宽
    width = spread * (1.0 + (1.0 - conf))
    low = float(max(0.0, p_base - width))
    high = float(p_base + width)

    details = []
    for (p, sim, price), wi, si in zip(items, w.tolist(), s.tolist()):
        details.append({
            "path": p,
            "filename": os.path.basename(p),
            "cosine": sim,
            "s01": si,
            "weight": wi,
            "price": price
        })

    return {
        "base_price": float(p_base),
        "price_low": low,
        "price_high": high,
        "confidence": conf,
        "spread": float(spread),
        "details": details
    }


def apply_quality_adjustment(pricing: dict, quality: dict):
    """
    demo 风格的轻量修正：清晰度/亮度影响置信度和最终价格的微调
    """
    p = pricing["base_price"]
    conf = pricing["confidence"]

    brightness = quality["brightness"]  # 0~255
    sharpness = quality["sharpness"]    # 通常几十到几千不等

    # 亮度惩罚：太暗<60 或太亮>210 降低置信度
    bright_penalty = 1.0
    if brightness < 60 or brightness > 210:
        bright_penalty = 0.85

    # 清晰度惩罚：太模糊（阈值你可以按你的图片调）
    sharp_penalty = 1.0
    if sharpness < 80:
        sharp_penalty = 0.80

    conf2 = float(np.clip(conf * bright_penalty * sharp_penalty, 0.0, 1.0))

    # 价格轻微调整：质量差略压价（最多 -5%）
    q_factor = 1.0
    if bright_penalty < 1.0:
        q_factor *= 0.98
    if sharp_penalty < 1.0:
        q_factor *= 0.95

    p2 = float(p * q_factor)

    # 区间也随 conf2 变宽/变窄（简单处理：按比例放大原区间宽度）
    mid = p2
    half = (pricing["price_high"] - pricing["price_low"]) / 2.0
    # conf2 越低 half 越大
    half2 = float(half * (1.0 + (1.0 - conf2)))
    low2 = float(max(0.0, mid - half2))
    high2 = float(mid + half2)

    pricing2 = dict(pricing)
    pricing2["final_price"] = p2
    pricing2["confidence"] = conf2
    pricing2["final_low"] = low2
    pricing2["final_high"] = high2
    pricing2["quality"] = quality
    pricing2["quality_factor"] = q_factor
    return pricing2



@torch.inference_mode()
def embed_one(img: Image.Image, model, transform, device) -> np.ndarray:
    x = transform(img).unsqueeze(0).to(device)  # [1,3,H,W]
    feat = model(x)                              # [1,D]
    feat = F.normalize(feat, dim=1)              # L2 normalize
    return feat.squeeze(0).cpu().numpy()         # [D]


@st.cache_resource
def load_model_and_transform(model_name: str = MODEL_NAME, device_str: str = "cpu"):
    device = torch.device(device_str)
    model = timm.create_model(model_name, pretrained=True, num_classes=0)
    model.eval().to(device)
    cfg = resolve_data_config({}, model=model)
    transform = create_transform(**cfg)
    return model, transform, device


@st.cache_resource
def build_gallery_embeddings(gallery_dir: str, model_name: str = MODEL_NAME):
    """
    启动时把 gallery 的 embedding 预先算好（10 张图很快），上传时就只算 query。
    """
    model, transform, device = load_model_and_transform(model_name, "cpu")
    paths = sorted(
        glob.glob(os.path.join(gallery_dir, "*.*"))
    )

    embs = []
    kept_paths = []
    for p in paths:
        try:
            img = load_rgb(p)
            emb = embed_one(img, model, transform, device)
            embs.append(emb)
            kept_paths.append(p)
        except Exception:
            continue

    if len(embs) == 0:
        return [], np.zeros((0, 1), dtype=np.float32)

    embs = np.stack(embs).astype(np.float32)  # [N, D]
    return kept_paths, embs


def topk_similar(query_emb: np.ndarray, gallery_paths: List[str], gallery_embs: np.ndarray, k: int = 5):
    # gallery_embs 和 query_emb 都是 L2 normalize 过的，所以 dot == cosine similarity
    sims = gallery_embs @ query_emb.astype(np.float32)  # [N]
    idx = np.argsort(-sims)[:k]
    return [(gallery_paths[i], float(sims[i])) for i in idx]


def main():
    st.set_page_config(page_title="Image Similarity Demo", layout="wide")
    st.title("🔍Fraud Detection for Your Product")

    if not os.path.isdir(GALLERY_DIR):
        st.error(f"找不到图库目录：{GALLERY_DIR}（请创建并放入你的10张图）")
        st.stop()

    model, transform, device = load_model_and_transform(MODEL_NAME, "cpu")
    gallery_paths, gallery_embs = build_gallery_embeddings(GALLERY_DIR, MODEL_NAME)

    st.sidebar.header("Settings")
    st.sidebar.write(f"Model: `{MODEL_NAME}`")
    st.sidebar.write(f"Gallery images loaded: **{len(gallery_paths)}**")
    top_k = st.sidebar.slider("Top K", min_value=1, max_value=10, value=5)

    uploaded = st.file_uploader("Please upload an image of your product", type=["jpg", "jpeg", "png"])

    col1, col2 = st.columns([1, 2])

    with col1:
        if uploaded is not None:
            q_img = Image.open(uploaded).convert("RGB")
            st.subheader("Query")
            st.image(q_img, use_container_width=True)

            q_emb = embed_one(q_img, model, transform, device)
            results = topk_similar(q_emb, gallery_paths, gallery_embs, k=top_k)
            # 读取价格表（建议放到 @st.cache_resource 里）
            price_map = load_price_map("prices.csv")

            pricing = compute_pricing_from_similar(results, price_map, temperature=0.12)

            if pricing is None:
                st.warning("TopK 结果里没有找到可用的价格（请检查 prices.csv 的 filename 是否匹配）。")
            else:
                quality = image_quality_metrics(q_img)  # 可选：不想依赖 opencv 就别用
                pricing = apply_quality_adjustment(pricing, quality)
                st.markdown("## 💰 Pricing")
                st.metric("Reference Price", f"${pricing['final_price']:.0f}")
                st.markdown("**Range**")
                st.slider(
                    label="",
                    min_value=float(pricing["final_low"]),
                    max_value=float(pricing["final_high"]),
                    value=float(pricing["final_price"]),
                    disabled=True
                )
                st.progress(pricing["confidence"])
                st.caption(
                    f"Confidence: {pricing['confidence']:.2f} | "
                    f"Brightness: {pricing['quality']['brightness']:.0f} | "
                    f"Sharpness: {pricing['quality']['sharpness']:.0f}"
                )

                #st.markdown("### 计算解释（TopK 加权）")
                #st.dataframe(pricing["details"])
                #df = pd.DataFrame(pricing["details"])
                #st.dataframe(df, use_container_width=True, height=260)

            with col2:
                st.subheader(f"Top-{top_k} Results")
                # 用网格展示
                grid_cols = st.columns(5)  # 你也可以改成 3/4 等
                for i, (p, score) in enumerate(results):
                    c = grid_cols[i % 5]
                    with c:
                        st.image(load_rgb(p), use_container_width=True)
                        #st.caption(f"{os.path.basename(p)}\nSimilarity: {score:.4f}")
                        fn = os.path.basename(p)
                        price = price_map.get(fn, None)

                        st.caption(f"Similarity: {score:.4f}")
                        if price is None:
                            st.caption("Price: N/A")
                        else:
                            st.caption(f"Price: ${price:.0f}")

        else:
            st.info("Please upload an image to see the similarity results.")


if __name__ == "__main__":
    price_map = load_price_map("prices.csv")  # 你之前 pricing 用的那个函数
    main()