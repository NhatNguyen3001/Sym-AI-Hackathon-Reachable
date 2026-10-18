import io
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, File, Request, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.checker import check_report, check_report_in_sandbox
from app.db import get_session, get_write_session
from app.errors import ApiError
from app.llm.vision import label_photo
from app.models import Report, uid
from app.sandbox import current_box, current_session

router = APIRouter()
MAX_BYTES = 10 * 1024 * 1024


@router.post("/reports/label")
async def label(request: Request, photo: UploadFile = File(...)):
    if not (photo.content_type or "").startswith("image/"):
        raise ApiError(415, "not_an_image", "Please upload a photo (an image file).")
    data = await photo.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ApiError(413, "too_large", "Photos must be 10 MB or smaller.")
    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise ApiError(415, "not_an_image", "We couldn't read that photo. Try a JPEG or PNG.")
    img.thumbnail((1600, 1600))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=85)  # re-encoding drops EXIF, including GPS location
    jpeg = out.getvalue()
    name = f"{uid()}.jpg"
    (request.app.state.settings.uploads_dir / name).write_bytes(jpeg)
    ai_label, ai_text = label_photo(jpeg, "image/jpeg", request.app.state.llm)
    request.app.state.photo_labels[f"/uploads/{name}"] = ai_label
    return {"photoUrl": f"/uploads/{name}", "aiLabel": ai_label, "aiText": ai_text}


class ReportIn(BaseModel):
    photoUrl: str | None = Field(None, pattern=r"^/uploads/[0-9a-f]{32}\.jpg$")
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    userLabel: Literal["blocked", "stairs", "broken_ramp", "slippery", "narrow", "fine"]
    note: str = Field("", max_length=1000)


def public(r: Report) -> dict:
    return {"id": r.id, "photoUrl": r.photo_url, "aiLabel": r.ai_label, "userLabel": r.user_label, "note": r.note,
            "lat": r.lat, "lng": r.lng, "status": r.status, "barrierId": r.barrier_id, "createdAt": r.created_at.isoformat()}


@router.post("/reports")
async def create_report(body: ReportIn, request: Request, tasks: BackgroundTasks,
                        session: Session = Depends(get_write_session)):
    # The AI label comes from our own upload step, never from the client, so the checker can trust it.
    ai_label = request.app.state.photo_labels.get(body.photoUrl) if body.photoUrl else None
    if body.photoUrl and body.photoUrl not in request.app.state.photo_labels:
        path = request.app.state.settings.uploads_dir / body.photoUrl.removeprefix("/uploads/")
        if path.exists():  # labels live in memory, so re-label after a server restart
            ai_label, _ = label_photo(path.read_bytes(), "image/jpeg", request.app.state.llm)
    report = Report(photo_url=body.photoUrl, ai_label=ai_label, user_label=body.userLabel, note=body.note,
                    lat=body.lat, lng=body.lng)
    box = current_box()
    if box is not None:  # demo sandbox: this phone only, in memory, never saved
        session.close()
        box.reports[report.id] = report
        out = public(report)
        sid = current_session.get()
        await request.app.state.broadcaster.publish("report_created", {"reportId": out["id"]}, session=sid)
        tasks.add_task(check_report_in_sandbox, request.app.state, box, sid, report)
        return out
    session.add(report)
    try:
        session.commit()
    except Exception:  # noqa: BLE001 - e.g. Turso unreachable: tell the person plainly
        session.rollback()
        session.close()
        raise ApiError(503, "save_failed", "Couldn't save your report right now. Please try again.")
    session.refresh(report)
    out = public(report)
    session.close()  # give the one Turso connection back now: the report check below needs it
    await request.app.state.broadcaster.publish("report_created", {"reportId": out["id"]})
    tasks.add_task(check_report, request.app.state, out["id"])
    return out
