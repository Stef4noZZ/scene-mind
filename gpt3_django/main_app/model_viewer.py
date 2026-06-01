MODEL_VIEWER_MODELS = [
    {
        'key': 'angelica',
        'label': 'Angelica',
        'path': './assets/angelica/scene.gltf',
        'description': 'The original Angelica 3D model.',
    },
    {
        'key': 'fem_head',
        'label': 'Fem Head',
        'path': './assets/fem_head/scene.gltf',
        'description': 'A detailed head model with an expressive face.',
    },
    {
        'key': 'fem_face',
        'label': 'Fem Face',
        'path': './assets/fem_face/scene.gltf',
        'description': 'A face study model with refined textures.',
    },
    {
        'key': 'wraith',
        'label': 'Wraith',
        'path': './assets/wraith/gltf/wraith.gltf',
        'description': 'A stylized wraith model with atmospheric details.',
    },
]

DEFAULT_MODEL_VIEWER_KEY = 'angelica'


def get_model_viewer_models():
    return MODEL_VIEWER_MODELS


def get_default_model_viewer_key():
    valid_keys = {model['key'] for model in MODEL_VIEWER_MODELS}
    return DEFAULT_MODEL_VIEWER_KEY if DEFAULT_MODEL_VIEWER_KEY in valid_keys else MODEL_VIEWER_MODELS[0]['key']


