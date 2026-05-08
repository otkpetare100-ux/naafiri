from PIL import Image
import os

def surgical_clean(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    pixdata = img.load()

    width, height = img.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixdata[x, y]
            
            # Si el píxel es muy grisáceo o muy blanquecino (R, G, B muy cercanos entre sí)
            # o si es directamente muy claro, lo hacemos transparente.
            diff_rg = abs(r - g)
            diff_gb = abs(g - b)
            diff_rb = abs(r - b)
            
            # Umbral: si los colores están a menos de 15 unidades de distancia (gris)
            # y el brillo total es alto (>150), es fondo.
            if (diff_rg < 20 and diff_gb < 20 and diff_rb < 20) and (r > 150):
                pixdata[x, y] = (255, 255, 255, 0)

    img.save(output_path, "PNG")

if __name__ == "__main__":
    path = r"c:\Users\Nanami\Desktop\s\bot discord\assets\estetica\corona.png"
    if os.path.exists(path):
        surgical_clean(path, path)
        print("Done")
    else:
        print("Missing")
