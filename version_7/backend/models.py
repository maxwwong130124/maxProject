from pydantic import BaseModel

class AuthModel(BaseModel):
    username: str
    password: str
    public_key: str