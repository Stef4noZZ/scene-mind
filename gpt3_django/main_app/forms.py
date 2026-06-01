from django import forms


class QuestionForm(forms.Form):
    prompt = forms.CharField(
        label='Ask the AI assistant',
        widget=forms.Textarea(
            attrs={
                'class': 'form-control',
                'placeholder': 'Type a question for the AI assistant...',
                'rows': 4,
            }
        ),
        max_length=1200,
        strip=True,
    )
