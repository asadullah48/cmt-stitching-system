from sqlalchemy import Column, String, Numeric, Boolean
from .base import BaseModel


class BillRateTemplate(BaseModel):
    __tablename__ = "cmt_bill_rate_templates"

    goods_type    = Column(String(50), nullable=False)   # bedrail | castel | tent | garment rack | zip
    bill_series   = Column(String(1),  nullable=False)   # A | B | C
    description   = Column(String(200), nullable=True)
    customer_rate = Column(Numeric(10, 2), nullable=False, default=0)
    labour_rate   = Column(Numeric(10, 2), nullable=False, default=0)  # 0 = no labour bill
    vendor_rate   = Column(Numeric(10, 2), nullable=False, default=0)  # 0 = no vendor bill
    is_active     = Column(Boolean, nullable=False, default=True)
