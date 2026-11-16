"""Shared atlas contract. PNG/glTF offsets start at the top left.

Original sculpture bounds, normalized by 009, rotated -90 degrees about Z:
(x,y,z) -> (y,-x,z). Project onto the landmark face plane before making UVs.
"""
EYES = ('neutral', 'blink', 'blinkLeft', 'blinkRight', 'happy', 'angry', 'sad', 'relaxed', 'surprised')
MOUTHS = ('neutral', 'aa', 'ih', 'ou', 'ee', 'oh', 'happy', 'angry', 'sad', 'surprised')
EXPRESSIONS = ('neutral', 'blink', 'blinkLeft', 'blinkRight', 'happy', 'angry', 'sad',
               'relaxed', 'surprised', 'aa', 'ih', 'ou', 'ee', 'oh')
EMOTIONS = ('happy', 'angry', 'sad', 'relaxed', 'surprised')
FRAMES = {'FaceEyes': (-.3224, .3224, .283, .658),
          'FaceMouth': (-.07325, .06825, .228, .367)}
CELL = 512
MARGIN = 41  # ceil(512 * .08)
SCULPTURE = {
    'eyeLeft': ((.241, .064, .419), (.290, .145, .497)),
    'eyeRight': ((.241, -.145, .419), (.290, -.064, .497)),
    'browLeft': ((.169, .074, .513), (.212, .216, .640)),
    'browRight': ((.169, -.216, .513), (.212, -.074, .640)),
    'mouth': ((.251, -.055, .303), (.286, .050, .404)),
}

def offset(names, name):
    index = names.index(name)
    return (index % 4 / 4, index // 4 / 4)


def targets(name):
    if name in EMOTIONS or name == 'neutral':
        return {'FaceEyes': name, 'FaceMouth': name if name in MOUTHS else 'neutral'}
    return {'FaceEyes': name} if name.startswith('blink') else {'FaceMouth': name}
