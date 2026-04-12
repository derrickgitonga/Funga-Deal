use async_trait::async_trait;
use axum::{
    extract::{FromRequest, Request},
    Json,
};
use serde::de::DeserializeOwned;
use validator::Validate;

use crate::api::error::AppError;

pub struct Valid<T>(pub T);

#[async_trait]
impl<T, S> FromRequest<S> for Valid<T>
where
    T: DeserializeOwned + Validate + Send + 'static,
    S: Send + Sync + 'static,
    Json<T>: FromRequest<S>,
    <Json<T> as FromRequest<S>>::Rejection: std::fmt::Display,
{
    type Rejection = AppError;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        let Json(value) = Json::<T>::from_request(req, state)
            .await
            .map_err(|e| AppError::Validation(e.to_string()))?;

        value
            .validate()
            .map_err(|e| AppError::Validation(e.to_string()))?;

        Ok(Valid(value))
    }
}
