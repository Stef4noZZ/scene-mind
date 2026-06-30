"""Provider-agnostic AI layer for SceneMind.

Exposes a small abstraction over chat LLM providers so the rest of the app
never imports a vendor SDK directly. See ``registry`` for the public entry
point.
"""
