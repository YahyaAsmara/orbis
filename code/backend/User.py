"""
Import flask login's UserMixin to use its predefined methods.
"""
from flask_login import UserMixin

class User(UserMixin): # Inherits UserMixin methods and attributes so that they can be used
    def __init__(self, id): # Constructor
        self.id = f"{id}" # Converts the id integer into a string and stores it into the User (get_id() requires id to be a string)