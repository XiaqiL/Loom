import os
from typing import List, Tuple
import numpy as np
from PIL import Image

import torch
import torch.nn.functional as F
import timm
from timm.data import resolve_data_config, create_transform


def load_rgb(path: str) -> Image.Image:
    return Image.open(path).convert("RGB")


@torch.inference_mode()
def embed_one(img: Image.Image, model: torch.nn.Module, transform, device) -> torch.Tensor:
    x = transform(img).unsqueeze(0).to(device)          # [1,3,H,W]
    feat = model(x)                                     # [1,D]
    feat = F.normalize(feat, dim=1)                     # L2 normalize
    return feat.squeeze(0).cpu()                        # [D]


def rank_topk(
    query_path: str,
    gallery_paths: List[str],
    model_name: str = "mobilenetv3_small_100",  
    device: str = "cpu"
) -> List[Tuple[str, float]]:
    device = torch.device(device)

    
    model = timm.create_model(model_name, pretrained=True, num_classes=0)
    model.eval().to(device)

    
    cfg = resolve_data_config({}, model=model)
    transform = create_transform(**cfg)

    
    q_emb = embed_one(load_rgb(query_path), model, transform, device).numpy()

    
    results = []
    for p in gallery_paths:
        if not os.path.exists(p):
            continue
        try:
            g_emb = embed_one(load_rgb(p), model, transform, device).numpy()
            sim = float(np.dot(q_emb, g_emb))  
            results.append((p, sim))
        except Exception:
            continue

    results.sort(key=lambda x: x[1], reverse=True)
    return results


if __name__ == "__main__":
    query = "imgs/query.jpg.png"
    gallery = [
        "imgs/img01.jpg.png",
        "imgs/img02.jpg.png",
        "imgs/img03.jpg.png",
        "imgs/img04.jpg.png",
        "imgs/img05.jpg.png",
        "imgs/img06.jpg.png",
        "imgs/img07.jpg.png",
        "imgs/img08.jpg.png",
        "imgs/img09.jpg.png",
        "imgs/img10.jpg.png",
    ]

    ranked = rank_topk(query, gallery, model_name="mobilenetv3_small_100", device="cpu")
    print("Similarity (high->low):")
    for path, score in ranked:
        print(f"{score:.4f}\t{path}")
