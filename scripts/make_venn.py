from PIL import Image, ImageDraw, ImageFont
import math

W, H = 1920, 1080
img = Image.new("RGB", (W, H), (17, 17, 17))
draw = ImageDraw.Draw(img, "RGBA")

# Circle params
r = 280
cx1 = W // 2 - 160  # left circle center
cx2 = W // 2 + 160  # right circle center
cy = H // 2 - 30

# Colors
left_fill = (60, 130, 200, 80)
right_fill = (200, 80, 60, 80)
left_outline = (80, 160, 240)
right_outline = (240, 100, 80)
overlap_color = (180, 140, 60)

# Draw filled circles
draw.ellipse([cx1 - r, cy - r, cx1 + r, cy + r], fill=left_fill, outline=left_outline, width=3)
draw.ellipse([cx2 - r, cy - r, cx2 + r, cy + r], fill=right_fill, outline=right_outline, width=3)

# Try to load a nice font, fall back to default
try:
    font_big = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 36)
    font_med = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 30)
    font_label = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 28)
except:
    try:
        font_big = ImageFont.truetype("/System/Library/Fonts/SFNSText.ttf", 36)
        font_med = ImageFont.truetype("/System/Library/Fonts/SFNSText.ttf", 30)
        font_label = ImageFont.truetype("/System/Library/Fonts/SFNSText.ttf", 28)
    except:
        font_big = ImageFont.load_default()
        font_med = font_big
        font_label = font_big

# Draw text in left circle (offset left of center to avoid overlap zone)
text_l1 = "Image"
text_l2 = "Creative Control"
bbox1 = draw.textbbox((0, 0), text_l1, font=font_big)
bbox2 = draw.textbbox((0, 0), text_l2, font=font_med)
lx = cx1 - 70
draw.text((lx - (bbox1[2] - bbox1[0]) // 2, cy - 30), text_l1, fill=(180, 210, 255), font=font_big)
draw.text((lx - (bbox2[2] - bbox2[0]) // 2, cy + 15), text_l2, fill=(180, 210, 255), font=font_med)

# Draw text in right circle
text_r1 = "Model"
text_r2 = "Creativity"
bbox3 = draw.textbbox((0, 0), text_r1, font=font_big)
bbox4 = draw.textbbox((0, 0), text_r2, font=font_med)
rx = cx2 + 70
draw.text((rx - (bbox3[2] - bbox3[0]) // 2, cy - 30), text_r1, fill=(255, 180, 170), font=font_big)
draw.text((rx - (bbox4[2] - bbox4[0]) // 2, cy + 15), text_r2, fill=(255, 180, 170), font=font_med)

# Arrow pointing to overlap zone
overlap_x = W // 2
arrow_start_y = cy + r + 80
arrow_end_y = cy + 60

# Arrow line
draw.line([(overlap_x, arrow_start_y), (overlap_x, arrow_end_y)], fill=(220, 200, 100), width=3)

# Arrowhead
head_size = 12
draw.polygon([
    (overlap_x, arrow_end_y),
    (overlap_x - head_size, arrow_end_y + head_size * 1.5),
    (overlap_x + head_size, arrow_end_y + head_size * 1.5),
], fill=(220, 200, 100))

# Label below arrow
label_text = "Using Anchor Images"
bbox_label = draw.textbbox((0, 0), label_text, font=font_label)
label_w = bbox_label[2] - bbox_label[0]
draw.text((overlap_x - label_w // 2, arrow_start_y + 15), label_text, fill=(220, 200, 100), font=font_label)

img.save("/Users/peteromalley/Downloads/venn_diagram.png")
print("done")
