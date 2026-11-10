"""Общие функции сглаживания стыков: мера резкости и смягчение кадра до заданной резкости."""
import numpy as np
from PIL import ImageFilter

def sharp(im):
    a = np.asarray(im.convert("L").resize((960, 540)), float)
    return (a[1:-1, 1:-1] * 4 - a[:-2, 1:-1] - a[2:, 1:-1] - a[1:-1, :-2] - a[1:-1, 2:]).var()

def soften(im, target):
    if sharp(im) <= target: return im
    lo, hi = 0.0, 4.0
    for _ in range(7):
        r = (lo + hi) / 2
        if sharp(im.filter(ImageFilter.GaussianBlur(r))) > target: lo = r
        else: hi = r
    return im.filter(ImageFilter.GaussianBlur(hi))
