import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { radii, spacing, withAlpha } from '../../theme/tokens';
import { useAppTheme } from '../../theme/ThemeProvider';

const TOOLBAR_ACTIONS = [
  { key: 'bold', label: 'B', command: "document.execCommand('bold', false);" },
  { key: 'italic', label: 'I', command: "document.execCommand('italic', false);" },
  { key: 'h2', label: 'H2', command: "document.execCommand('formatBlock', false, 'h2');" },
  { key: 'h3', label: 'H3', command: "document.execCommand('formatBlock', false, 'h3');" },
  { key: 'ul', label: '•', command: "document.execCommand('insertUnorderedList', false);" },
  { key: 'ol', label: '1.', command: "document.execCommand('insertOrderedList', false);" },
  { key: 'quote', label: '"', command: "document.execCommand('formatBlock', false, 'blockquote');" },
];

function createStyles(colors) {
  return StyleSheet.create({
    shell: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panelElevated,
      overflow: 'hidden',
    },
    toolbar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      backgroundColor: withAlpha(colors.accentMore, 0.04),
    },
    tool: {
      minWidth: 34,
      minHeight: 30,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panel,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xs,
    },
    toolText: {
      color: colors.ink,
      fontWeight: '800',
      fontSize: 12,
    },
    webView: {
      minHeight: 180,
      backgroundColor: 'transparent',
    },
  });
}

function buildEditorHtml({ content, editable, placeholder, colors }) {
  const serializedContent = JSON.stringify(content || '');
  const serializedPlaceholder = JSON.stringify(placeholder || 'Your response');
  const serializedColors = JSON.stringify(colors);

  return `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <style>
          :root {
            color-scheme: light only;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: transparent;
            color: ${colors.ink};
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          body {
            padding: 0;
          }
          #editor {
            min-height: 160px;
            padding: 14px 14px 18px;
            line-height: 1.45;
            font-size: 15px;
            outline: none;
            color: ${colors.ink};
          }
          #editor:empty:before {
            content: attr(data-placeholder);
            color: ${colors.inkMuted};
          }
          h2, h3, p, ul, ol, blockquote {
            margin: 0 0 0.7em;
          }
          ul, ol {
            padding-left: 1.3em;
          }
          blockquote {
            border-left: 3px solid ${colors.line};
            padding-left: 0.8em;
            color: ${colors.inkMuted};
          }
          a {
            color: ${colors.accentMore};
          }
        </style>
      </head>
      <body>
        <div id="editor" data-placeholder=${serializedPlaceholder} ${editable ? 'contenteditable="true"' : ''}></div>
        <script>
          const editor = document.getElementById('editor');
          const initialContent = ${serializedContent};
          const palette = ${serializedColors};
          editor.innerHTML = initialContent || '';

          function normalizeHtml(html) {
            const normalized = String(html || '').trim();
            if (!normalized || normalized === '<br>' || normalized === '<div><br></div>') {
              return '';
            }
            return normalized;
          }

          function post(type, payload) {
            if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
          }

          function syncHeight() {
            const height = Math.max(180, Math.ceil(document.documentElement.scrollHeight || editor.scrollHeight || 180));
            post('height', { height });
          }

          function syncChange() {
            const html = normalizeHtml(editor.innerHTML);
            post('change', { html });
            syncHeight();
          }

          if (${editable ? 'true' : 'false'}) {
            editor.addEventListener('input', syncChange);
            editor.addEventListener('blur', syncChange);
          }

          window.__taskSeriesEditor = {
            run(command) {
              if (!${editable ? 'true' : 'false'}) return;
              editor.focus();
              eval(command);
              syncChange();
            },
            setContent(nextHtml) {
              editor.innerHTML = nextHtml || '';
              syncHeight();
            }
          };

          syncHeight();
        </script>
      </body>
    </html>
  `;
}

export function RichTextHtmlEditor({
  value,
  onChange,
  editable = true,
  placeholder = 'Your response',
  minHeight = 180,
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const webViewRef = useRef(null);
  const lastSentRef = useRef(value || '');
  const [webViewKey, setWebViewKey] = useState(0);
  const [height, setHeight] = useState(minHeight);

  useEffect(() => {
    const normalizedValue = value || '';
    if (normalizedValue === lastSentRef.current) return;
    lastSentRef.current = normalizedValue;
    setWebViewKey((current) => current + 1);
  }, [value]);

  const html = useMemo(
    () => buildEditorHtml({ content: value || '', editable, placeholder, colors }),
    [colors, editable, placeholder, value]
  );

  function runToolbarCommand(command) {
    if (!editable || !webViewRef.current) return;
    webViewRef.current.injectJavaScript(`
      if (window.__taskSeriesEditor) {
        window.__taskSeriesEditor.run(${JSON.stringify(command)});
      }
      true;
    `);
  }

  function handleMessage(event) {
    let payload = null;
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (payload?.type === 'change') {
      lastSentRef.current = payload.html || '';
      onChange?.(payload.html || '');
    }

    if (payload?.type === 'height' && Number.isFinite(payload.height)) {
      setHeight(Math.max(minHeight, payload.height));
    }
  }

  return (
    <View style={styles.shell}>
      {editable ? (
        <View style={styles.toolbar}>
          {TOOLBAR_ACTIONS.map((action) => (
            <Pressable
              key={action.key}
              accessibilityRole="button"
              accessibilityLabel={`Format response with ${action.key}`}
              onPress={() => runToolbarCommand(action.command)}
              style={styles.tool}
            >
              <Text style={styles.toolText}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <WebView
        ref={webViewRef}
        key={`${editable ? 'edit' : 'read'}-${webViewKey}`}
        originWhitelist={['*']}
        source={{ html }}
        onMessage={handleMessage}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        javaScriptEnabled
        hideKeyboardAccessoryView
        keyboardDisplayRequiresUserAction={false}
        style={[styles.webView, { minHeight: height, height }]}
      />
    </View>
  );
}
