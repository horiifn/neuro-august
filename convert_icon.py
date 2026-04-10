from PIL import Image

# Открываем PNG
img = Image.open('icon.png')

# Конвертируем в RGBA если нужно
if img.mode != 'RGBA':
    img = img.convert('RGBA')

# Создаем квадратное изображение
size = max(img.size)
new_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
new_img.paste(img, ((size - img.size[0]) // 2, (size - img.size[1]) // 2))

# Сохраняем как ICO с несколькими размерами
new_img.save('icon.ico', format='ICO', sizes=[
    (256, 256),
    (128, 128),
    (64, 64),
    (48, 48),
    (32, 32),
    (16, 16)
])

print("Иконка успешно создана: icon.ico")
