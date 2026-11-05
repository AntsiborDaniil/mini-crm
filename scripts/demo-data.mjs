export const accounts = {
  manager: {
    email: 'anna.sokolova@example.com',
    password: 'Demo-Manager-2026',
    name: 'Анна Соколова',
    role: 'manager',
  },
  ivan: {
    email: 'ivan.krylov@example.com',
    password: 'Demo-Executor-1',
    name: 'Иван Крылов',
    role: 'executor',
  },
  maria: {
    email: 'maria.lebedeva@example.com',
    password: 'Demo-Executor-2',
    name: 'Мария Лебедева',
    role: 'executor',
  },
}

export const reworkComment =
  'Не хватает маяков на пролёте. Выровняйте стену и отправьте фото.'

export const objects = [
  { key: 'north', name: 'ЖК «Северный»', address: 'ул. Лесная, 12' },
  { key: 'school', name: 'Школа №4', address: 'пр. Строителей, 7' },
  { key: 'warehouse', name: 'Склад на Обводном', address: 'наб. Обводного канала, 120' },
]

export const tasks = [
  {
    title: 'Завезти арматуру 12 мм',
    description: 'Принять машину у ворот и разложить пачки по этажам 2–4.',
    object: 'north',
    assignee: 'ivan',
    path: ['Новая'],
  },
  {
    title: 'Монтаж опалубки перекрытия',
    description: 'Секция Б, отметка +6.400. Щиты уже на площадке.',
    object: 'north',
    assignee: 'ivan',
    path: ['Новая', 'В работе'],
  },
  {
    title: 'Приёмка бетона стен',
    description: 'Секция А. Нужен акт и фото кубов.',
    object: 'north',
    assignee: 'maria',
    path: ['Новая', 'В работе', 'На проверке'],
  },
  {
    title: 'Штукатурка лестничной клетки',
    description: 'Первый марш, стены под покраску.',
    object: 'school',
    assignee: 'maria',
    path: ['Новая', 'В работе', 'На проверке', 'На доработке'],
  },
  {
    title: 'Геодезическая съёмка осей',
    description: 'Вынести оси склада и сдать схему.',
    object: 'warehouse',
    assignee: 'ivan',
    path: ['Новая', 'В работе', 'На проверке', 'Принята'],
  },
]
