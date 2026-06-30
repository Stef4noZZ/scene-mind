from django.urls import path

from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('api/catalog/', views.api_catalog, name='api_catalog'),
    path('api/chat/', views.api_chat, name='api_chat'),
    path('api/chat/stream/', views.api_chat_stream, name='api_chat_stream'),
    path('api/compare/', views.api_compare, name='api_compare'),
]
