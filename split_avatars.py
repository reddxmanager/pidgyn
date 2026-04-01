"""
Quick grid splitter for Pidgyn profile photos.
No background removal - just splits and exports as JPEG.

Usage:
    python split_avatars.py women.png men.png
"""

import sys
from pathlib import Path
from PIL import Image

# Profile name mapping: grid position -> profile name from seed script
# Grid 1 (women): left-to-right, top-to-bottom
GRID1_NAMES = [
    "sofia",     # Row 1: Spanish
    "yuki",      # Row 1: Japanese  
    "priya",     # Row 1: Indian
    "hana",      # Row 2: Korean
    "amelie",    # Row 2: French
    "linh",      # Row 2: Vietnamese
    "nong",      # Row 3: Thai
    "anna",      # Row 3: Russian
    "maria",     # Row 3: Filipino
]

# Grid 2 (mixed): left-to-right, top-to-bottom
GRID2_NAMES = [
    "marco",     # Row 1: Italian man
    "lucas",     # Row 1: Brazilian man
    "chenwei",   # Row 1: Chinese man
    "fatima",    # Row 2: Arab woman
    "klaus",     # Row 2: German man
    "isabella",  # Row 2: Spanish woman
    "sakura",    # Row 3: Japanese woman
    "jin",       # Row 3: Korean man
    "giulia",    # Row 3: Italian woman
]

def split_grid(img_path, names, output_dir, rows=3, cols=3, size=200):
    img = Image.open(img_path).convert("RGB")
    w, h = img.size
    cell_w = w // cols
    cell_h = h // rows
    
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    idx = 0
    for row in range(rows):
        for col in range(cols):
            if idx >= len(names):
                break
            x = col * cell_w
            y = row * cell_h
            cell = img.crop((x, y, x + cell_w, y + cell_h))
            
            # Crop to square (center crop)
            cw, ch = cell.size
            if cw != ch:
                s = min(cw, ch)
                left = (cw - s) // 2
                top = (ch - s) // 2
                cell = cell.crop((left, top, left + s, top + s))
            
            # Resize to target
            cell = cell.resize((size, size), Image.Resampling.LANCZOS)
            
            out_path = output_dir / f"{names[idx]}.jpg"
            cell.save(out_path, "JPEG", quality=85)
            print(f"  + {names[idx]}.jpg")
            idx += 1

def main():
    if len(sys.argv) < 3:
        print("Usage: python split_avatars.py women_grid.png men_grid.png")
        return
    
    output_dir = Path(__file__).parent / "avatars"
    
    print(f"Splitting grid 1 (women)...")
    split_grid(sys.argv[1], GRID1_NAMES, output_dir)
    
    print(f"Splitting grid 2 (mixed)...")
    split_grid(sys.argv[2], GRID2_NAMES, output_dir)
    
    print(f"\nDone! {len(GRID1_NAMES) + len(GRID2_NAMES)} avatars in {output_dir}/")

if __name__ == "__main__":
    main()
