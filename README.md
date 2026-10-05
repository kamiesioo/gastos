# Gastos

Finanzas personales con **React + Supabase**: cuentas de usuario, ingresos, gastos por categoría, deudas en cuotas, meta de ahorro y gráfico mensual animado.

React 18 se carga como módulo ES desde esm.sh y las plantillas usan [htm](https://github.com/developit/htm) (JSX sin compilador), así que **no hace falta Node ni build**: se sirve como archivos estáticos.

## Puesta en marcha

1. En Supabase → **SQL Editor**, ejecutá en orden (ambas se pueden re-ejecutar sin perder datos):
   1. [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) — tablas, RLS y funciones de escritura.
   2. [`supabase/migrations/002_profiles_audit_delete.sql`](supabase/migrations/002_profiles_audit_delete.sql) — perfiles de usuario, bitácora, borrado de movimientos y vistas de control.
2. [`js/config.js`](js/config.js) ya apunta al proyecto (URL + publishable key, ambas públicas).
3. Serví la carpeta (los módulos ES no andan desde `file://`):

   ```bash
   python3 -m http.server 8000
   ```

   y abrí <http://localhost:8000>.

**Confirmación de email:** Supabase exige confirmar el correo antes de ingresar. Para desactivarlo: Authentication → Sign In / Providers → Email → "Confirm email". El envío de mails integrado tiene un límite bajo por hora.

## Estructura

```
index.html            entrada (CSP + <div id="root">)
css/styles.css        estilos, tema claro/oscuro, animaciones
js/main.js, App.js    arranque y control de sesión
js/components/        AuthScreen, Dashboard, Donut, EntryForm, History, SavingCard, Debts, Icons
js/hooks.js           useCountUp (número animado), useDrawn (animación de entrada del gráfico)
js/finance.js         reglas de negocio puras
js/store.js           acceso a datos: Supabase, o modo demo con localStorage si config.js está vacío
js/deps.js            versiones de React/htm/supabase-js
supabase/migrations/  SQL
```

## Seguridad

- Usuarios en Supabase Auth (`auth.users`); cada fila de datos lleva `user_id` y las políticas RLS solo permiten **leer** las propias.
- Los usuarios no tienen permiso de escritura sobre las tablas: solo pueden llamar a funciones (`register_income`, `register_expense`, `delete_transaction`, `add_debt`, `delete_debt`, `set_saving_pct`) que validan montos, categorías y fechas en el servidor y operan siempre sobre `auth.uid()`.
- El cliente usa solo la **publishable key**. La **secret key** (`sb_secret_…`) se saltea RLS y nunca debe estar en esta carpeta.
- La política CSP de `index.html` solo permite scripts propios y de esm.sh, y conexiones a `*.supabase.co`.

## Quitar movimientos

Cada ingreso o gasto tiene un botón de eliminar (con confirmación).

- **Gasto**: el dinero vuelve al disponible.
- **Ingreso**: se deshacen también las cuotas que descontó y se restaura el saldo de las deudas. No se permite si ese dinero ya se gastó (el disponible quedaría negativo).
- Las cuotas no se borran solas: se eliminan junto con su ingreso.

## Control de usuarios y movimientos (para vos)

La migración 002 crea:

| Objeto | Qué es |
|---|---|
| `profiles` | un usuario por fila (email, fecha de alta), creado automáticamente al registrarse |
| `movement_log` | bitácora de **todo** movimiento creado o eliminado; sobrevive aunque el usuario lo borre |
| `admin_users` (vista) | por usuario: alta, último ingreso, totales, saldo y cantidad de movimientos |
| `admin_movements` (vista) | bitácora legible con el email de cada usuario |

Solo vos las ves (SQL Editor o Table Editor del dashboard de Supabase); los usuarios de la app no tienen acceso. Ejemplos:

```sql
select * from public.admin_users order by registered_at desc;

-- actividad reciente, incluidos los movimientos eliminados
select at, action, email, tx_type, amount, category, note
from public.admin_movements limit 50;

-- movimientos eliminados por un usuario
select * from public.admin_movements where action = 'delete' and email = 'alguien@ejemplo.com';
```
