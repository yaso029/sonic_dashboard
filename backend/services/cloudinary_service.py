import cloudinary
import cloudinary.uploader
import os

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)


def upload_image(file_bytes: bytes, public_id: str = None, folder: str = "sonic_properties") -> dict:
    try:
        kwargs = {"folder": folder, "resource_type": "image"}
        if public_id:
            kwargs["public_id"] = public_id
        result = cloudinary.uploader.upload(file_bytes, **kwargs)
        return {"url": result["secure_url"], "public_id": result["public_id"]}
    except Exception as e:
        return {"error": str(e)}


def upload_file(file_bytes: bytes, file_name: str = None, folder: str = "sonic_hr_docs") -> dict:
    try:
        kwargs = {"folder": folder, "resource_type": "auto"}
        if file_name:
            kwargs["use_filename"] = True
            kwargs["unique_filename"] = True
        result = cloudinary.uploader.upload(file_bytes, **kwargs)
        return {"url": result["secure_url"], "public_id": result["public_id"]}
    except Exception as e:
        return {"error": str(e)}


def delete_file(public_id: str) -> dict:
    try:
        cloudinary.uploader.destroy(public_id, resource_type="raw")
        return {"ok": True}
    except Exception as e:
        return {"error": str(e)}


def delete_image(public_id: str) -> dict:
    try:
        cloudinary.uploader.destroy(public_id)
        return {"ok": True}
    except Exception as e:
        return {"error": str(e)}
