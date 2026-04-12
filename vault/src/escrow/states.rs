mod private {
    pub trait Sealed {}
}

pub trait EscrowState: private::Sealed + Send + Sync + 'static {}

pub struct Created;
pub struct Deposited;
pub struct Shipped;
pub struct Delivered;
pub struct InDispute;
pub struct Released;
pub struct Refunded;

impl private::Sealed for Created {}
impl private::Sealed for Deposited {}
impl private::Sealed for Shipped {}
impl private::Sealed for Delivered {}
impl private::Sealed for InDispute {}
impl private::Sealed for Released {}
impl private::Sealed for Refunded {}

impl EscrowState for Created {}
impl EscrowState for Deposited {}
impl EscrowState for Shipped {}
impl EscrowState for Delivered {}
impl EscrowState for InDispute {}
impl EscrowState for Released {}
impl EscrowState for Refunded {}

pub const STATUS_CREATED: &str = "created";
pub const STATUS_DEPOSITED: &str = "deposited";
pub const STATUS_SHIPPED: &str = "shipped";
pub const STATUS_DELIVERED: &str = "delivered";
pub const STATUS_IN_DISPUTE: &str = "in_dispute";
pub const STATUS_RELEASED: &str = "released";
pub const STATUS_REFUNDED: &str = "refunded";
