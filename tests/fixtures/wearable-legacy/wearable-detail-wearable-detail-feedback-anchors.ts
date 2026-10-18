// Complete native and actual maintained compiler evidence for WearableDetailFeedback.
export const wearableDetailFeedbackAnchors = {
  "zeroActivity": {
    "slots": [],
    "nativeSkeleton": "<div class=\"wearable-detail-empty\">Every day shows 0 — Oura suppresses the Activity composite score while Rest Mode is on. Check the <b>Steps</b> card for raw movement data, or disable Rest Mode in the Oura app.</div>",
    "production": {
      "html": "<!--[--><!---->\n\n<!--[0--><div class=\"wearable-detail-empty\">Every day shows 0 — Oura suppresses the Activity composite score while Rest Mode is on. Check the <b>Steps</b> card for raw movement data, or disable Rest Mode in the Oura app.</div>\n<!--]--><!--]-->",
      "prefix": "<!--[--><!---->\n\n<!--[0-->",
      "suffix": "\n<!--]--><!--]-->",
      "edits": []
    },
    "development": {
      "html": "<!--[--><!---->\n\n<!--[0--><div class=\"wearable-detail-empty\">Every day shows 0 — Oura suppresses the Activity composite score while Rest Mode is on. Check the <b>Steps</b> card for raw movement data, or disable Rest Mode in the Oura app.</div>\n<!--]--><!--]-->",
      "prefix": "<!--[--><!---->\n\n<!--[0-->",
      "suffix": "\n<!--]--><!--]-->",
      "edits": []
    }
  },
  "emptyChartWithManual": {
    "slots": [
      {
        "port": "emptyWindow",
        "coordinate": "gb-wearable-detail-wearabledetailfeedback-emptychartwithmanual-empty-window-end"
      },
      {
        "port": "olderManualHint",
        "coordinate": "gb-wearable-detail-wearabledetailfeedback-emptychartwithmanual-older-manual-hint-end"
      }
    ],
    "nativeSkeleton": "<div class=\"wearable-detail-empty\">No chart samples for this metric in gb-wearable-detail-wearabledetailfeedback-emptychartwithmanual-empty-window-end. Manual readings are listed belowgb-wearable-detail-wearabledetailfeedback-emptychartwithmanual-older-manual-hint-end.</div>",
    "production": {
      "html": "<!--[--><!---->\n\n<!--[1--><div class=\"wearable-detail-empty\">No chart samples for this metric in gb-wearable-detail-wearabledetailfeedback-emptychartwithmanual-empty-window-end. Manual readings are listed belowgb-wearable-detail-wearabledetailfeedback-emptychartwithmanual-older-manual-hint-end.</div>\n<!--]--><!--]-->",
      "prefix": "<!--[--><!---->\n\n<!--[1-->",
      "suffix": "\n<!--]--><!--]-->",
      "edits": []
    },
    "development": {
      "html": "<!--[--><!---->\n\n<!--[1--><div class=\"wearable-detail-empty\">No chart samples for this metric in gb-wearable-detail-wearabledetailfeedback-emptychartwithmanual-empty-window-end. Manual readings are listed belowgb-wearable-detail-wearabledetailfeedback-emptychartwithmanual-older-manual-hint-end.</div>\n<!--]--><!--]-->",
      "prefix": "<!--[--><!---->\n\n<!--[1-->",
      "suffix": "\n<!--]--><!--]-->",
      "edits": []
    }
  },
  "emptyChart": {
    "slots": [
      {
        "port": "emptyWindow",
        "coordinate": "gb-wearable-detail-wearabledetailfeedback-emptychart-empty-window-end"
      }
    ],
    "nativeSkeleton": "<div class=\"wearable-detail-empty\">No daily samples for this metric in gb-wearable-detail-wearabledetailfeedback-emptychart-empty-window-end. Either your wearable doesn't share this metric, the feature is off on your device, or you didn't wear it. Try Sync now, or reconnect to refresh permissions.</div>",
    "production": {
      "html": "<!--[--><!---->\n\n<!--[2--><div class=\"wearable-detail-empty\">No daily samples for this metric in gb-wearable-detail-wearabledetailfeedback-emptychart-empty-window-end. Either your wearable doesn't share this metric, the feature is off on your device, or you didn't wear it. Try Sync now, or reconnect to refresh permissions.</div>\n<!--]--><!--]-->",
      "prefix": "<!--[--><!---->\n\n<!--[2-->",
      "suffix": "\n<!--]--><!--]-->",
      "edits": []
    },
    "development": {
      "html": "<!--[--><!---->\n\n<!--[2--><div class=\"wearable-detail-empty\">No daily samples for this metric in gb-wearable-detail-wearabledetailfeedback-emptychart-empty-window-end. Either your wearable doesn't share this metric, the feature is off on your device, or you didn't wear it. Try Sync now, or reconnect to refresh permissions.</div>\n<!--]--><!--]-->",
      "prefix": "<!--[--><!---->\n\n<!--[2-->",
      "suffix": "\n<!--]--><!--]-->",
      "edits": []
    }
  },
  "emfHint": {
    "slots": [
      {
        "port": "assessmentActionAttributes",
        "coordinate": "gb-wearable-detail-wearabledetailfeedback-emfhint-assessment-action-attributes-end"
      }
    ],
    "nativeSkeleton": "<div class=\"wearable-detail-emf-hint\"><span aria-hidden=\"true\">💡</span> Sleep regressing? Sometimes it's the room. <a href=\"#\" gb-wearable-detail-wearabledetailfeedback-emfhint-assessment-action-attributes-end data-umami-event=\"emf-nudge-wearable-sleep\">Check your EMF environment →</a></div>",
    "production": {
      "html": "<!--[--><!---->\n\n<!--[3--><div class=\"wearable-detail-emf-hint\"><span aria-hidden=\"true\">💡</span> Sleep regressing? Sometimes it's the room. <a href=\"#wearable-detail-assessment\" data-gb-wearable-detail-wearabledetailfeedback-emfhint-assessment-action-attributes-end=\"\" data-umami-event=\"emf-nudge-wearable-sleep\">Check your EMF environment →</a></div>\n<!--]--><!--]-->",
      "prefix": "<!--[--><!---->\n\n<!--[3-->",
      "suffix": "\n<!--]--><!--]-->",
      "edits": [
        {
          "start": 126,
          "end": 152,
          "before": "wearable-detail-assessment",
          "after": ""
        },
        {
          "start": 154,
          "end": 159,
          "before": "data-",
          "after": ""
        },
        {
          "start": 241,
          "end": 244,
          "before": "=\"\"",
          "after": ""
        }
      ]
    },
    "development": {
      "html": "<!--[--><!---->\n\n<!--[3--><div class=\"wearable-detail-emf-hint\"><span aria-hidden=\"true\">💡</span> Sleep regressing? Sometimes it's the room. <a href=\"#wearable-detail-assessment\" data-gb-wearable-detail-wearabledetailfeedback-emfhint-assessment-action-attributes-end=\"\" data-umami-event=\"emf-nudge-wearable-sleep\">Check your EMF environment →</a></div>\n<!--]--><!--]-->",
      "prefix": "<!--[--><!---->\n\n<!--[3-->",
      "suffix": "\n<!--]--><!--]-->",
      "edits": [
        {
          "start": 126,
          "end": 152,
          "before": "wearable-detail-assessment",
          "after": ""
        },
        {
          "start": 154,
          "end": 159,
          "before": "data-",
          "after": ""
        },
        {
          "start": 241,
          "end": 244,
          "before": "=\"\"",
          "after": ""
        }
      ]
    }
  }
} as const;
