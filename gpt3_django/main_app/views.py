import json

from django.contrib import messages
from django.shortcuts import render
from django.utils.safestring import mark_safe

from .forms import QuestionForm
from viewer.model_viewer import get_model_viewer_models, get_default_model_viewer_key
from .openai_service import ask_openai

def index(request):
    answer = None
    form = QuestionForm(request.POST or None)

    if request.method == 'POST':
        if form.is_valid():
            prompt = form.cleaned_data['prompt']
            try:
                answer = ask_openai(prompt)
            except Exception as exc:
                messages.error(request, f'Could not reach OpenAI: {exc}')
        else:
            messages.error(request, 'Please enter a valid question.')

    model_viewer_models = get_model_viewer_models()
    return render(
        request,
        'index.html',
        {
            'form': form,
            'answer': answer,
            'models': model_viewer_models,
            'models_json': mark_safe(json.dumps(model_viewer_models)),
            'default_model': get_default_model_viewer_key(),
        },
    )