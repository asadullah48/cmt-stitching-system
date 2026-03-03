from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


class PartyCreate(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    payment_terms: int = 30


class PartyUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    payment_terms: Optional[int] = None


class PartyOut(BaseModel):
    id: UUID
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    payment_terms: int
    balance: Decimal

    model_config = {"from_attributes": True}


class PartyListResponse(BaseModel):
    data: list[PartyOut]
    total: int
    page: int
    size: int
