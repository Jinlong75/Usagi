"""Shared atlas contract. PNG/glTF offsets start at the top left.

usagi3d2 sculpture bounds, one metre height, already rotated to Blender front -Y.
Reproduce with measure_layout.py; regression tolerance is 2 mm.
"""
EYES = ('neutral', 'blink', 'blinkLeft', 'blinkRight', 'happy', 'angry', 'sad', 'relaxed', 'surprised')
MOUTHS = ('neutral', 'aa', 'ih', 'ou', 'ee', 'oh', 'happy', 'angry', 'sad', 'surprised')
EXPRESSIONS = ('neutral', 'blink', 'blinkLeft', 'blinkRight', 'happy', 'angry', 'sad',
               'relaxed', 'surprised', 'aa', 'ih', 'ou', 'ee', 'oh')
EMOTIONS = ('happy', 'angry', 'sad', 'relaxed', 'surprised')
FRAMES = {'FaceEyes': (-.310, .310, .300, .660),
          'FaceMouth': (-.100, .100, .130, .420)}
HEAD_WIDTH = .656082
NORMAL = (-.0000274714457, -.996761798859, .080411151052)
LINE_M = .01065  # 25% thinner than .0142 m, 1.62% of measured head width.
EYE_CENTERS = ((-.103558, .444379), (.103819, .444379))
EYE_DIAMETER = .0917  # old horizontal diameter .07054 m * 1.3; now circular.
BROW_BOUNDS = ((-.211766, -.073515, .500327, .627630),
               (.077926, .216177, .500327, .627630))
MOUTH_BOUNDS = (-.052996, .055455, .282696, .385879)
# TODO(lead): usagi3d2 has no sculpted/colored cheeks. Confirm F01-derived anchors
# (0.27 head widths sideways, 0.10 below eyes) on the measured source surface.
CHEEK_CENTERS = ((-.177142, .378770), (.177142, .378770))
CHEEK_SIZE = (.1312164, .0874776)  # F01 width/head ~0.20; oval aspect 1.5.
CELL = 512
MARGIN = 41  # ceil(512 * .08)
SCULPTURE = {
    'eyeLeft': ((.064729, -.291891, .428432), (.142892, -.248901, .505618)),
    'eyeRight': ((-.142892, -.291891, .428432), (-.064240, -.248901, .505618)),
    'browLeft': ((.077919, -.227894, .519785), (.216170, -.185393, .645335)),
    'browRight': ((-.211773, -.227894, .519785), (-.073522, -.185393, .645335)),
    'mouth': ((-.053004, -.287005, .304836), (.055447, -.252320, .409380)),
}

def offset(names, name):
    index = names.index(name)
    return (index % 4 / 4, index // 4 / 4)


def targets(name):
    if name in EMOTIONS or name == 'neutral':
        return {'FaceEyes': name, 'FaceMouth': name if name in MOUTHS else 'neutral'}
    return {'FaceEyes': name} if name.startswith('blink') else {'FaceMouth': name}
