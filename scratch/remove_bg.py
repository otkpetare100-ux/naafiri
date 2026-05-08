from PIL import Image
import os

def remove_background(input_path, output_path):
    # Abrir la imagen
    img = Image.open(input_path).convert("RGBA")
    datas = img.getdata()

    new_data = []
    # Definimos el color del fondo a eliminar (aproximado por ser JPG/sólido)
    # En este caso parece ser un tono beige/claro
    for item in datas:
        # Si el color es muy claro/cercano al blanco/beige, lo hacemos transparente
        # R, G, B > 200 suele ser suficiente para fondos claros
        if item[0] > 210 and item[1] > 200 and item[2] > 180:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)

    img.putdata(new_data)
    img.save(output_path, "PNG")

if __name__ == "__main__":
    input_file = r"c:\Users\Nanami\Desktop\s\bot discord\assets\estetica\temp_corona.jpg"
    output_file = r"c:\Users\Nanami\Desktop\s\bot discord\assets\estetica\corona.png"
    
    # Asegurarse de que el directorio existe
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    # Nota: Este script asume que la imagen ya está guardada en input_file
    if os.path.exists(input_file):
        remove_background(input_file, output_file)
        print("✅ Fondo eliminado y corona actualizada.")
    else:
        print("❌ Archivo temporal no encontrado.")
