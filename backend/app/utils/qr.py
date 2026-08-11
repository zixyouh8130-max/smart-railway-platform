import qrcode
import os

def generate_qr(ticket_no: str):
    img = qrcode.make(ticket_no)
    path = f"qr/{ticket_no}.png"
    os.makedirs("qr", exist_ok=True)
    img.save(path)
    return path