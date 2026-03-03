from fastapi import APIRouter

from .endpoints import auth, parties, orders, production, transactions, dashboard

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(parties.router)
api_router.include_router(orders.router)
api_router.include_router(production.router)
api_router.include_router(transactions.router)
api_router.include_router(dashboard.router)
