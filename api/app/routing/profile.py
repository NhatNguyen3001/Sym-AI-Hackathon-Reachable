from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Avoid(Camel):
    stairs: bool = True
    kerbs_no_ramp: bool = True
    slippery_when_wet: bool = True
    uneven: bool = False


class Destination(Camel):
    entrance: bool = True
    toilet: bool = True
    parking: bool = False


class Profile(Camel):
    aid: str = "manual_wheelchair"
    max_slope: int = Field(5, ge=2, le=12)
    avoid: Avoid = Avoid()
    destination: Destination = Destination()
    text: str = ""


DEFAULT_PROFILE = Profile(text="I use a manual wheelchair. Nothing steeper than 5%, and I need an accessible toilet where I'm going.")
