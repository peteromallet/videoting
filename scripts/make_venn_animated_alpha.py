from PIL import Image, ImageDraw, ImageFont, ImageChops
import subprocess, os, math

W, H = 1920, 1080
FPS = 30
OUT_DIR = "/tmp/venn_frames_alpha"
os.makedirs(OUT_DIR, exist_ok=True)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR = os.path.join(SCRIPT_DIR, "..", "inputs")

# Circle params
r = 280
cx1 = W // 2 - 160
cx2 = W // 2 + 160
cy = H // 2 - 30

# Colors (all RGBA for transparent compositing)
left_fill = (60, 130, 200, 80)
right_fill = (200, 80, 60, 80)
left_outline = (80, 160, 240, 255)
right_outline = (240, 100, 80, 255)
label_color_l = (180, 210, 255, 255)
label_color_r = (255, 180, 170, 255)
arrow_color = (220, 200, 100, 255)
flash_color = (255, 240, 140, 120)

# Font
try:
    font_big = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 38)
    font_med = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 30)
    font_label = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 28)
except Exception:
    font_big = ImageFont.load_default()
    font_med = font_big
    font_label = font_big


def ease_out(t):
    return 1 - (1 - t) ** 3


def alpha_scale(color, frac):
    """Scale the alpha channel of an RGBA color."""
    return (color[0], color[1], color[2], int(color[3] * frac))


def draw_circle_left(draw, alpha=1.0):
    fill = alpha_scale(left_fill, alpha)
    outline = alpha_scale(left_outline, alpha)
    draw.ellipse([cx1 - r, cy - r, cx1 + r, cy + r], fill=fill, outline=outline, width=3)
    tc = alpha_scale(label_color_l, alpha)
    t1, t2 = "Creative", "Control"
    bb1 = draw.textbbox((0, 0), t1, font=font_big)
    bb2 = draw.textbbox((0, 0), t2, font=font_med)
    lx = cx1 - 70
    draw.text((lx - (bb1[2] - bb1[0]) // 2, cy - 30), t1, fill=tc, font=font_big)
    draw.text((lx - (bb2[2] - bb2[0]) // 2, cy + 15), t2, fill=tc, font=font_med)


def draw_circle_right(draw, alpha=1.0):
    fill = alpha_scale(right_fill, alpha)
    outline = alpha_scale(right_outline, alpha)
    draw.ellipse([cx2 - r, cy - r, cx2 + r, cy + r], fill=fill, outline=outline, width=3)
    tc = alpha_scale(label_color_r, alpha)
    t1, t2 = "Model", "Creativity"
    bb1 = draw.textbbox((0, 0), t1, font=font_big)
    bb2 = draw.textbbox((0, 0), t2, font=font_med)
    rx = cx2 + 70
    draw.text((rx - (bb1[2] - bb1[0]) // 2, cy - 30), t1, fill=tc, font=font_big)
    draw.text((rx - (bb2[2] - bb2[0]) // 2, cy + 15), t2, fill=tc, font=font_med)


def draw_label(draw, alpha=1.0):
    tc = alpha_scale(arrow_color, alpha)
    text = "Using Anchor Images"
    bb = draw.textbbox((0, 0), text, font=font_label)
    tw = bb[2] - bb[0]
    draw.text((W // 2 - tw // 2, cy + r + 95), text, fill=tc, font=font_label)


def draw_arrow(draw, progress=1.0, alpha=1.0):
    tc = alpha_scale(arrow_color, alpha)
    overlap_x = W // 2
    start_y = cy + r + 80
    end_y = cy
    current_end_y = int(start_y + (end_y - start_y) * progress)
    draw.line([(overlap_x, start_y), (overlap_x, current_end_y)], fill=tc, width=3)
    hs = 12
    draw.polygon([
        (overlap_x, current_end_y),
        (overlap_x - hs, current_end_y + int(hs * 1.5)),
        (overlap_x + hs, current_end_y + int(hs * 1.5)),
    ], fill=tc)


def draw_intersection_flash(alpha=1.0):
    m1 = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m1).ellipse([cx1 - r, cy - r, cx1 + r, cy + r], fill=255)
    m2 = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m2).ellipse([cx2 - r, cy - r, cx2 + r, cy + r], fill=255)
    intersection = ImageChops.multiply(m1, m2)
    intersection = intersection.point(lambda p: int(p * alpha))
    flash = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    flash_solid = Image.new("RGBA", (W, H), flash_color)
    flash.paste(flash_solid, mask=intersection)
    return flash


# Timeline (seconds):
# 0.0-0.3: empty
# 0.3-0.7: left circle appears
# 0.7-1.2: hold
# 1.2-1.6: right circle appears
# 1.6-2.1: hold
# 2.1-2.5: label text appears
# 2.5-3.2: arrow grows upward
# 3.2-3.8: intersection flashes
# 3.8-5.0: hold final

total_frames = FPS * 5

for f in range(total_frames):
    t = f / FPS

    # Transparent background
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, "RGBA")

    left_a = 0 if t < 0.3 else (ease_out((t - 0.3) / 0.4) if t < 0.7 else 1.0)
    right_a = 0 if t < 1.2 else (ease_out((t - 1.2) / 0.4) if t < 1.6 else 1.0)
    label_a = 0 if t < 2.1 else (ease_out((t - 2.1) / 0.4) if t < 2.5 else 1.0)
    arrow_prog = 0 if t < 2.5 else (ease_out((t - 2.5) / 0.7) if t < 3.2 else 1.0)

    if t < 3.2:
        flash_a = 0
    elif t < 3.5:
        flash_a = ease_out((t - 3.2) / 0.3)
    elif t < 3.8:
        flash_a = max(1.0 - (t - 3.5) / 0.3, 0.3)
    else:
        flash_a = 0.3

    if left_a > 0:
        draw_circle_left(draw, left_a)
    if right_a > 0:
        draw_circle_right(draw, right_a)
    if label_a > 0:
        draw_label(draw, label_a)
    if arrow_prog > 0:
        draw_arrow(draw, arrow_prog, label_a)
    if flash_a > 0:
        flash_layer = draw_intersection_flash(flash_a)
        img = Image.alpha_composite(img, flash_layer)

    img.save(os.path.join(OUT_DIR, f"frame_{f:04d}.png"))

print(f"Generated {total_frames} frames in {OUT_DIR}")

# Encode to WebM VP9 with alpha
output = os.path.join(INPUT_DIR, "venn_diagram_video.webm")
cmd = [
    "ffmpeg", "-y",
    "-framerate", str(FPS),
    "-i", os.path.join(OUT_DIR, "frame_%04d.png"),
    "-c:v", "libvpx-vp9",
    "-pix_fmt", "yuva420p",
    "-b:v", "2M",
    "-auto-alt-ref", "0",
    output,
]
print(f"Encoding → {output}")
subprocess.run(cmd, check=True)
print("Done!")
