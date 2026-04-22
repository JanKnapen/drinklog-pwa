import os

ALCOHOL_UNIT_DIVISOR = float(os.getenv('ALCOHOL_UNIT_DIVISOR', '15.0'))
CAFFEINE_UNIT_DIVISOR = float(os.getenv('CAFFEINE_UNIT_DIVISOR', '80.0'))

PUBLIC_CONFIG = {
    'alcohol_unit_divisor': ALCOHOL_UNIT_DIVISOR,
    'caffeine_unit_divisor': CAFFEINE_UNIT_DIVISOR,
}
