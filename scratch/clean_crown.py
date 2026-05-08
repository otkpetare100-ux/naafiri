from PIL import Image
import os

def clean_checkers(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    datas = img.getdata()

    new_data = []
    for item in datas:
        # Detectamos los colores típicos de los cuadritos (blanco y gris claro)
        r, g, b, a = item
        
        # Blanco o casi blanco
        is_white = r > 240 and g > 240 and b > 240
        # Gris claro típico de fondo de transparencia falso
        is_grey = (r > 190 and r < 210) and (g > 190 and g < 210) and (b > 190 and b < 210)
        
        if is_white or is_grey:
            new_data.append((255, 255, 255, 0)) # Transparente
        else:
            new_data.append(item)

    img.putdata(new_data)
    img.save(output_path, "PNG")

if __name__ == "__main__":
    path = r"c:\Users\Nanami\Desktop\s\bot discord\assets\estetica\corona.png"
    if os.path.exists(path):
        clean_checkers(path, path)
        print("✨ Corona limpiada quirúrgicamente.")
    else:
        print("❌ No se encontró la corona para limpiar.")
