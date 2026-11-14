---
title: Formularios
description: Envía un formulario HTML de tu web estática a Codeqlick Cloud y recibe cada envío por email y en la consola, con protección contra spam y exportación a CSV.
group: services
order: 11
---

Una web estática no tiene servidor para recibir un formulario. Con Codeqlick Cloud, tu página envía el formulario a Codeqlick, que guarda cada envío, lo manda por email a tu equipo y lo muestra en la consola.

## Crea un formulario

En la pestaña **Formularios** del proyecto, crea un formulario. Elige un nombre, si quieres recibir un email por cada envío y qué miembros del equipo reciben los emails (de 1 a 5 personas de tu equipo; no puedes escribir otras direcciones). Codeqlick da al formulario una clave pública que empieza por `cqf_`.

La clave está pensada para ir en el HTML de tu página. Si se abusa de ella, cámbiala en la consola: las copias de la clave anterior dejan de funcionar.

## Envía un formulario

```html
<form method="post" action="https://api.codeqlick.com/v1/cloud/forms/cqf_YOUR_KEY">
  <label>Nombre <input name="name" required /></label>
  <label>Email <input name="email" type="email" required /></label>
  <label>Mensaje <textarea name="message" required></textarea></label>

  <!-- Honeypot: los visitantes reales nunca lo ven, los bots lo rellenan -->
  <input name="_gotcha" tabindex="-1" autocomplete="off" style="display:none" />

  <input type="hidden" name="_redirect" value="https://web.codeqlick.app/gracias/" />
  <input type="hidden" name="_subject" value="Mensaje nuevo desde la web" />
  <button>Enviar</button>
</form>
```

Puedes usar cualquier nombre de campo. Los campos que empiezan por `_` son instrucciones y no se guardan como datos:

| Campo       | Qué hace                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `_redirect` | Adónde enviar al visitante después. Debe ser una de las direcciones de tu proyecto.                 |
| `_gotcha`   | Un honeypot. Cuando se rellena, el envío se responde como correcto y no se guarda en ninguna parte. |
| `_subject`  | El asunto del email de aviso.                                                                       |

Cuando hay un campo `email` con una dirección válida, pasa a ser el "responder a" del email, así respondes directamente al visitante.

Un envío normal de formulario recibe una redirección (`303`) a `_redirect`, o de vuelta a la página de origen, con `?form=ok` o `?form=error` añadido. Cuando ninguna de las dos es una dirección de tu proyecto, el visitante ve una página breve de "enviado".

## Envía con JavaScript

Envía JSON o datos de formulario con `fetch`. La respuesta es JSON:

```js
const response = await fetch('https://api.codeqlick.com/v1/cloud/forms/cqf_YOUR_KEY', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', message: 'Hola' }),
});
const result = await response.json(); // { ok: true } o { ok: false, error: '…' }
```

También puedes probar con curl:

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/forms/cqf_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Ana", "message": "Hola" }'
```

## Reglas

- Un envío tiene hasta 30 campos. El nombre de un campo tiene hasta 60 caracteres, un valor hasta 5.000 y el envío completo hasta 20 KB.
- No se aceptan archivos (`400`).
- Un envío desde el navegador solo se acepta desde las direcciones de tu proyecto: `https://<proyecto>.codeqlick.app`, las direcciones de sus despliegues y sus [dominios propios](/es/custom-domains/) verificados. Otros orígenes reciben `403`. Se aceptan los envíos sin cabecera `Origin`, como los de curl.
- Cada dirección IP puede enviar 10 veces por minuto entre todos los formularios.
- El plan gratuito permite 3 formularios por proyecto y 1.000 envíos al mes por equipo (PRO: 20 y 20.000). Pasado el límite, los envíos reciben `429` y los propietarios de tu equipo reciben un email ese mes.

## Envíos recibidos

La consola lista los envíos del más reciente al más antiguo, con búsqueda, borrado uno a uno y exportación a CSV (UTF-8, una columna por cada campo visto). La API ofrece lo mismo:

```sh
curl "https://api.codeqlick.com/v1/cloud/projects/<project-id>/forms/<form-id>/submissions.csv" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" -o submissions.csv
```

Codeqlick guarda cada envío 180 días y después lo borra. Guarda los campos, el email del visitante cuando lo hay y la página de la que vino el envío (solo origen y ruta). No guarda direcciones IP.

## Privacidad

Tú decides qué pregunta tu formulario, así que eres responsable de esos datos. Codeqlick los guarda por ti como encargado del tratamiento, como indican las condiciones de Cloud.
