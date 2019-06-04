# UIStrings Syntax

## ICU Syntax

### Ordinals

### Selects (Gender)

### Primitive Formatting

This include number formatting like `{timeInMs, number, milliseconds}` and string replacements like `{some_name}`.

## message.json Syntax

### Why we use message.json

It is the [Chrome Standard](https://developer.chrome.com/extensions/i18n-messages) for i18n messages.

### Parts of a message.json message

(From the Chrome Docs)

```json
{
  "name": {
    "message": "Message text, with optional placeholders.",
    "description": "Translator-aimed description of the message.",
    "placeholders": {
      "placeholder_name": {
        "content": "A string to be placed within the message.",
        "example": "Translator-aimed example of the placeholder string."
      },
      ...
    }
  },
  ...
}
```

## Our message system

We use UIStrings & i18n.js to extract strings from individual js files into locale.json files.  This allows us to keep strings close
to the code in which they are used so that developers can easily understand their context.  It also comes with its own syntax.  

UIStrings can be defined in 1 of 2 ways:
* simple strings (no placeholders):
  ```Javascript
  /** Imperative title of a Lighthouse audit that tells the user to minify (remove whitespace) the page's CSS code. This is displayed in a list of audit titles that Lighthouse generates. */
  title: 'Minify CSS',
  ```
* nested objects (needs placeholders):
  ```Javascript
  /** Imperative title of a Lighthouse audit that tells the user to minify (remove whitespace) the page's CSS code. This is displayed in a list of audit titles that Lighthouse generates. */
  title: {
    message: 'Minify CSS like {css}',
    placeholders: {
      css: '`<link rel=stylesheet>`',
    },
  },
  ```
TODO(exterkamp): explain all the comments and where they go/what they become.

TODO(exterkamp): explain why we can't use some ICU like number formatting.

### The pipeline

file_with_UIStrings.js -> exported to locale.json file -> read by i18n.js -> $placeholder$'s replaced -> {ICU} syntax replaced => final string

TODO(exterkamp): Simple example

Complex example:

1. string in `file_with_UIStrings.js`
    ```Javascript
    /** (Message Description goes here) Description of a Lighthouse audit that tells the user *why* they should minify (remove whitespace) the page's CSS code. This is displayed after a user expands the section to see more. No character length limits. 'Learn More' becomes link text to additional documentation. */
    description: {
      message: 'Minifying CSS files can reduce network payload sizes. {link_start}Learn More!!!{link_end}. This audit took {milliseconds} ms.',
      placeholders: {
        link_start: '[->',
        link_end: '](https://developers.google.com/web/tools/lighthouse/audits/minify-css)',
        /** 520 (Placeholder examples go here) */
        milliseconds: '{timeInMs, number, milliseconds}',
      },
    },
    ```

2. string when exported to locale.json file (en-US)
    ```json
    "lighthouse-core/audits/byte-efficiency/unminified-css.js | description": {
      "message": "Minifying CSS files can reduce network payload sizes. $link_start$Learn More!!!$link_end$. This audit took $milliseconds$ ms.",
      "description": "(Message Description goes here) Description of a Lighthouse audit that tells the user *why* they should minify (remove whitespace) the page's CSS code. This is displayed after a user expands the section to see more. No character length limits. 'Learn More' becomes link text to additional documentation.",
      "placeholders": {
        "link_start": {
          "content": "[->"
        },
        "link_end": {
          "content": "](https://developers.google.com/web/tools/lighthouse/audits/minify-css)"
        },
        "milliseconds": {
          "content": "{timeInMs, number, milliseconds}",
          "example": "520 (Placeholder examples go here)"
        }
      }
    },
    ```

3. string when read by i18n.js (initially)
    ```Javascript
    message = "Minifying CSS files can reduce network payload sizes. $link_start$Learn More!!!$link_end$. This audit took $milliseconds$ ms."
    sent_values = {timeInMs: 10}
    ```

4. string when placeholders replaced (with the static content)
    ```Javascript
    message = "Minifying CSS files can reduce network payload sizes. [->Learn More!!!](https://developers.google.com/web/tools/lighthouse/audits/minify-css). This audit took {timeInMs, number, milliseconds} ms."
    sent_values = {timeInMs: 10}
    ```

5. string when ICU syntax has been replaced (with the sent_values)
    ```Javascript
    message = "Minifying CSS files can reduce network payload sizes. [->Learn More!!!](https://developers.google.com/web/tools/lighthouse/audits/minify-css). This audit took 10 ms."
    ```
