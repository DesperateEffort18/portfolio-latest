# img2ascii.py
import argparse, sys
from PIL import Image

# Dense to light; swap or tweak to taste
CHARS = "@%#*+=-:. "

def to_ascii(img, width=120, invert=False):
    # keep aspect ratio; 0.55 compensates font height
    w = width
    h = int(img.height * (w / img.width) * 0.55)
    img = img.convert("L").resize((w, h))
    if invert:
        img = Image.eval(img, lambda p: 255 - p)

    # Convert iterator to list so slicing works
    pixels = list(img.getdata())

    out = []
    for i in range(0, len(pixels), w):
        row = "".join(CHARS[p * (len(CHARS)-1) // 255] for p in pixels[i:i+w])
        out.append(row)
    return "\n".join(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--width", type=int, default=120)
    ap.add_argument("--invert", action="store_true")
    args = ap.parse_args()
    try:
        img = Image.open(args.image)
    except Exception as e:
        print("Could not open image:", e, file=sys.stderr); sys.exit(1)
    print(to_ascii(img, width=args.width, invert=args.invert))
