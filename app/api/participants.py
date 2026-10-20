"""Participants API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from app import db
from app.models import Participant, ParticipantCreate, ParticipantUpdate

router = APIRouter(prefix="/api/participants", tags=["participants"])


@router.get("", response_model=list[Participant])
async def list_participants():
    return db.get_participants()


@router.post("", status_code=status.HTTP_201_CREATED, response_model=Participant)
async def create_participant_endpoint(payload: ParticipantCreate):
    try:
        return db.create_participant(payload.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{participant_id}", response_model=Participant)
async def update_participant_endpoint(participant_id: str, payload: ParticipantUpdate):
    p = db.update_participant(participant_id, payload.model_dump(exclude_unset=True))
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    return p


@router.delete("/{participant_id}")
async def delete_participant_endpoint(participant_id: str):
    success, error = db.delete_participant(participant_id)
    if not success:
        raise HTTPException(status_code=400, detail=error or "Failed to delete participant")
    return {"success": True, "id": participant_id}
