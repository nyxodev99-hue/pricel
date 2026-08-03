-- Achievements ---------------------------------------------------------
INSERT OR IGNORE INTO achievements (id, code, name, description, icon, condition_type, condition_value) VALUES
  ('ach_first_pixel',    'first_pixel',        'Premier pixel',            'Place ton tout premier pixel.',                  '🎨', 'pixels_placed',    1),
  ('ach_100_pixels',     'pixels_100',         '100 pixels placés',        'Place 100 pixels au total.',                     '🖌️', 'pixels_placed',    100),
  ('ach_1000_pixels',    'pixels_1000',        '1000 pixels placés',       'Place 1000 pixels au total.',                    '🏆', 'pixels_placed',    1000),
  ('ach_owns_1000',      'owns_1000',          'Grand propriétaire',       'Possède 1000 pixels en même temps.',             '👑', 'pixels_owned',     1000),
  ('ach_big_conquest',   'conquest_over_100',  'Conquérant',               'Conquiers un pixel qui coûtait plus de 100 crédits.', '⚔️', 'conquest_price_gte', 100);

-- First monthly event: "4 green corners" -> -10% on every pixel's price ---
INSERT OR IGNORE INTO events (id, code, name, description, config, schedule_cron, active) VALUES
  (
    'evt_green_corners',
    'green_corners',
    'Les 4 coins verts',
    'Si les quatre coins de la toile sont verts au moment de l''événement mensuel, tous les pixels voient leur prix diminuer de 10% (plancher 1 crédit).',
    '{"trigger":{"type":"corners_color","params":{"color":"#00C853"}},"effect":{"type":"price_multiply_all","params":{"factor":0.9,"floor":1}}}',
    '0 0 1 * *',
    1
  );
