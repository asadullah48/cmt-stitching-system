from fastapi import APIRouter

from .endpoints import auth, parties, orders, production, transactions, dashboard
from .endpoints.quality import router as quality_router
from .endpoints.dispatch import router as dispatch_router
from .endpoints.inventory import router as inventory_router
from .endpoints.products import router as products_router
from .endpoints.bills import router as bills_router
from .endpoints.settings import router as settings_router
from .endpoints.insights import router as insights_router
from .endpoints.expenses import router as expenses_router
from .endpoints.todos import router as todos_router
from .endpoints.overhead import router as overhead_router
from .endpoints.accessories import router as accessories_router
from .endpoints.share_links import router as share_links_router
from .endpoints.bill_rate_templates import router as bill_rate_templates_router

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(parties.router)
api_router.include_router(orders.router)
api_router.include_router(production.router)
api_router.include_router(transactions.router)
api_router.include_router(dashboard.router)
api_router.include_router(quality_router)
api_router.include_router(dispatch_router)
api_router.include_router(inventory_router)
api_router.include_router(products_router)
api_router.include_router(bills_router)
api_router.include_router(settings_router)
api_router.include_router(insights_router)
api_router.include_router(expenses_router)
api_router.include_router(todos_router)
api_router.include_router(overhead_router)
api_router.include_router(accessories_router)
api_router.include_router(share_links_router)
api_router.include_router(bill_rate_templates_router)
