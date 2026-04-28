from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.limiter import limiter
from app.models import Business
from app.schemas import BusinessLogin, BusinessOut, BusinessRegister, TokenOut
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])
_settings = get_settings()


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(_settings.rate_limit_login)
async def register(
    request: Request,  # noqa: ARG001 — slowapi reads request.client.host
    payload: BusinessRegister,
    db: AsyncSession = Depends(get_db),
) -> TokenOut:
    existing = await db.execute(select(Business).where(Business.phone == payload.phone))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Phone already registered")

    business = Business(
        name=payload.name,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        business_type=payload.business_type,
        address=payload.address,
        city=payload.city,
        country=payload.country,
    )
    db.add(business)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Phone already registered") from None
    await db.refresh(business)

    token = create_access_token(business.id)
    return TokenOut(access_token=token, business=BusinessOut.model_validate(business))


# Pre-computed dummy hash so the login miss-path runs the same bcrypt work
# as the hit-path, eliminating a timing oracle that would let an attacker
# enumerate registered phone numbers.
_DUMMY_HASH = hash_password("__dummy_for_constant_time__")


@router.post("/login", response_model=TokenOut)
@limiter.limit(_settings.rate_limit_login)
async def login(
    request: Request,  # noqa: ARG001 — slowapi reads request.client.host
    payload: BusinessLogin,
    db: AsyncSession = Depends(get_db),
) -> TokenOut:
    result = await db.execute(select(Business).where(Business.phone == payload.phone))
    business = result.scalar_one_or_none()
    target_hash = business.password_hash if business else _DUMMY_HASH
    password_ok = verify_password(payload.password, target_hash)
    if not business or not password_ok:
        raise HTTPException(status_code=401, detail="Invalid phone or password")
    token = create_access_token(business.id)
    return TokenOut(access_token=token, business=BusinessOut.model_validate(business))
