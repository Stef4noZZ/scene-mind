import os

import openai

DEFAULT_OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-3.5-turbo')


def _get_api_key():
    return os.getenv('OPENAI_API_KEY')


def ask_openai(prompt, model=None, max_tokens=250, temperature=0.7):
    api_key = _get_api_key()
    if not api_key:
        raise ValueError(
            'OpenAI API key is not configured. Set OPENAI_API_KEY in your environment.'
        )

    openai.api_key = api_key
    model = model or DEFAULT_OPENAI_MODEL

    response = openai.ChatCompletion.create(
        model=model,
        messages=[{'role': 'user', 'content': prompt}],
        temperature=temperature,
        max_tokens=max_tokens,
        top_p=1,
        frequency_penalty=0,
        presence_penalty=0,
    )

    choice = response.choices[0]
    return choice.message.get('content', '').strip()
