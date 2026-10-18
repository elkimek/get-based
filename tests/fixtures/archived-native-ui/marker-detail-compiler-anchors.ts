// Exact actual maintained compiler anchors for this owner, before any user/domain data insertion.
export const markerDetailCompilerAnchors = {
  "band": [
    "[",
    "[0",
    "]",
    "]"
  ],
  "low-zone": [
    "[",
    "[1",
    "]",
    "]"
  ],
  "high-zone": [
    "[",
    "[2",
    "]",
    "]"
  ],
  "optimal-zone": [
    "[",
    "[3",
    "]",
    "]"
  ],
  "edited-badge": [
    "[",
    "[4",
    "]",
    "]"
  ],
  "edit-control": [
    "[",
    "[5",
    "]",
    "]"
  ],
  "suggestion": [
    "[",
    "[6",
    "]",
    "]"
  ],
  "phase": [
    "[",
    "[0",
    "]",
    "]"
  ],
  "date-note": [
    "[",
    "[1",
    "]",
    "]"
  ],
  "manual-revert": [
    "[",
    "[2",
    "]",
    "]"
  ],
  "manual-badge": [
    "[",
    "[3",
    "]",
    "]"
  ],
  "delete-value": [
    "[",
    "[4",
    "]",
    "]"
  ],
  "value-note": [
    "[",
    "[5",
    "]",
    "]"
  ],
  "add-note": [
    "[",
    "[6",
    "]",
    "]"
  ],
  "alternate-value": [
    "[",
    "[7",
    "]",
    "]"
  ],
  "row": [
    "[",
    "[8",
    "]",
    "]"
  ],
  "more": [
    "[",
    "[9",
    "]",
    "]"
  ],
  "last-values": [
    "[",
    "[10",
    "]",
    "]"
  ],
  "trend": [
    "[",
    "[11",
    "]",
    "]"
  ],
  "collection-context": [
    "[",
    "[12",
    "]",
    "]"
  ],
  "source-file": [
    "[",
    "[13",
    "]",
    "]"
  ],
  "source-edited": [
    "[",
    "[14",
    "]",
    "]"
  ],
  "source-report": [
    "[",
    "[15",
    "]",
    "]"
  ],
  "source-manual": [
    "[",
    "[16",
    "]",
    "]"
  ],
  "reference": [
    "[",
    "[0",
    "]",
    "]"
  ]
} as const;

// Actual private SSR skeletons, acquired before any data insertion.
export const markerDetailPrivateSkeletons = {
  "add-note": "<div class=\"mv-value-note add-note\" role=\"button\" tabindex=\"0\" title=\"Add a note for this value\" data-marker-detail-owned-actions=\"getbased-marker-detail-owned-slot-0-end\">+ note</div>",
  "alternate-value": "<div class=\"mv-alt\" title=\"Same value, alternate unit\">\u2248 getbased-marker-detail-owned-slot-0-end getbased-marker-detail-owned-slot-1-end</div>",
  "band": "<div class=\"gb-range-band\" aria-label=\"Range position\">\n      <div class=\"gb-range-band-track\">\n        getbased-marker-detail-owned-slot-0-end\n        getbased-marker-detail-owned-slot-1-end\n        getbased-marker-detail-owned-slot-2-end\n      </div>\n      <div class=\"gb-range-band-dot gb-range-band-dot-getbased-marker-detail-owned-slot-3-end\" style=\"left:getbased-marker-detail-owned-slot-4-end%\"></div>\n      <div class=\"gb-range-band-scale\"><span>getbased-marker-detail-owned-slot-5-end</span><span>getbased-marker-detail-owned-slot-6-end</span></div>\n    </div>",
  "collection-context": "<div class=\"mv-collection-context\">getbased-marker-detail-owned-slot-0-end</div>",
  "date-note": "<button type=\"button\" class=\"mv-note\" data-marker-detail-owned-actions=\"getbased-marker-detail-owned-slot-0-end\">Note</button><div class=\"mv-note-text\">getbased-marker-detail-owned-slot-1-end</div>",
  "delete-value": "<button class=\"mv-delete\" data-marker-detail-owned-actions=\"getbased-marker-detail-owned-slot-0-end\" title=\"Remove this value\">\u00d7</button>",
  "edit-control": " \u00b7 <button type=\"button\" class=\"ref-editablegetbased-marker-detail-owned-slot-0-end\" aria-label=\"Edit getbased-marker-detail-owned-slot-1-end range, currently getbased-marker-detail-owned-slot-2-end\" data-marker-detail-owned-actions=\"getbased-marker-detail-owned-slot-3-end\">Edit getbased-marker-detail-owned-slot-4-end</button>getbased-marker-detail-owned-slot-5-end",
  "edited-badge": " <span class=\"ref-edited-badge\" role=\"button\" tabindex=\"0\" aria-label=\"getbased-marker-detail-owned-slot-0-end\" title=\"getbased-marker-detail-owned-slot-1-end\" data-marker-detail-owned-actions=\"getbased-marker-detail-owned-slot-2-end\">getbased-marker-detail-owned-slot-3-end \u00d7</span>",
  "high-zone": "<div class=\"gb-range-band-zone gb-range-band-zone-high\" style=\"left:getbased-marker-detail-owned-slot-0-end%;width:getbased-marker-detail-owned-slot-1-end%\"></div>",
  "last-values": "<button class=\"marker-history-show-more\" data-marker-detail-owned-actions=\"getbased-marker-detail-owned-slot-0-end\">Show last getbased-marker-detail-owned-slot-1-end values</button>",
  "low-zone": "<div class=\"gb-range-band-zone gb-range-band-zone-low\" style=\"left:0%;width:getbased-marker-detail-owned-slot-0-end%\"></div>",
  "manual-badge": " <span class=\"ref-edited-badge\" title=\"Manually entered\">manual</span>",
  "manual-revert": " <span class=\"ref-edited-badge\" role=\"button\" tabindex=\"0\" aria-label=\"Revert manual value to imported value\" title=\"Manual \u2014 click to revert to imported value\" data-marker-detail-owned-actions=\"getbased-marker-detail-owned-slot-0-end\">manual \u00d7</span>",
  "more": "<button class=\"marker-history-show-more\" data-marker-detail-owned-actions=\"getbased-marker-detail-owned-slot-0-end\">getbased-marker-detail-owned-slot-1-end</button>",
  "optimal-zone": "<div class=\"gb-range-band-opt\" style=\"left:getbased-marker-detail-owned-slot-0-end%;width:getbased-marker-detail-owned-slot-1-end%\"></div>",
  "phase": "<div class=\"mv-phase\">getbased-marker-detail-owned-slot-0-end \u2022 getbased-marker-detail-owned-slot-1-end\u2013getbased-marker-detail-owned-slot-2-end</div>",
  "reference": "getbased-marker-detail-owned-slot-0-end: <span class=\"ref-edit-field\"><input type=\"text\" inputmode=\"decimal\" value=\"getbased-marker-detail-owned-slot-1-end\" placeholder=\"none\" class=\"ref-edit-input\" id=\"ref-edit-min\"/><button type=\"button\" class=\"ref-edit-clear\" data-marker-detail-owned-clear-minimum=\"getbased-marker-detail-owned-slot-2-end\" title=\"Clear (open-ended)\">\u00d7</button></span> \u2013 <span class=\"ref-edit-field\"><input type=\"text\" inputmode=\"decimal\" value=\"getbased-marker-detail-owned-slot-3-end\" placeholder=\"none\" class=\"ref-edit-input\" id=\"ref-edit-max\"/><button type=\"button\" class=\"ref-edit-clear\" data-marker-detail-owned-clear-maximum=\"getbased-marker-detail-owned-slot-4-end\" title=\"Clear (open-ended)\">\u00d7</button></span> <button type=\"button\" class=\"ref-edit-save\" data-marker-detail-owned-save-actions=\"getbased-marker-detail-owned-slot-5-end\">Save</button>",
  "row": "<div class=\"modal-value-card marker-history-row status-getbased-marker-detail-owned-slot-0-end\">getbased-marker-detail-owned-slot-1-end\n      <div class=\"marker-history-date-row\"><div class=\"mv-date\">getbased-marker-detail-owned-slot-2-endgetbased-marker-detail-owned-slot-3-end</div>getbased-marker-detail-owned-slot-4-end</div>\n      <div class=\"marker-history-value-row\"><div class=\"mv-value val-getbased-marker-detail-owned-slot-5-end\" data-marker-detail-owned-edit-attributes=\"getbased-marker-detail-owned-slot-6-end\">getbased-marker-detail-owned-slot-7-endgetbased-marker-detail-owned-slot-8-end</div><div class=\"mv-status val-getbased-marker-detail-owned-slot-9-end\">getbased-marker-detail-owned-slot-10-end</div></div>\n      getbased-marker-detail-owned-slot-11-endgetbased-marker-detail-owned-slot-12-endgetbased-marker-detail-owned-slot-13-endgetbased-marker-detail-owned-slot-14-end</div>",
  "source-edited": "<div class=\"mv-source mv-source-manual\">manually edited</div>",
  "source-file": "<div class=\"mv-source\" title=\"getbased-marker-detail-owned-slot-0-end\">getbased-marker-detail-owned-slot-1-end</div>",
  "source-manual": "<div class=\"mv-source mv-source-manual\">manual entry</div>",
  "source-report": "<div class=\"mv-source\">Imported reportgetbased-marker-detail-owned-slot-0-end</div>",
  "suggestion": "<a class=\"marker-range-suggest\" href=\"getbased-marker-detail-owned-slot-0-end\" target=\"_blank\" rel=\"noopener noreferrer\" title=\"Open a public, pre-filled GitHub issue without including your health data\">Suggest a better range <span aria-hidden=\"true\">\u2197</span></a>",
  "trend": "<div class=\"modal-ref-info\"><strong>Trend:</strong> getbased-marker-detail-owned-slot-0-end by getbased-marker-detail-owned-slot-1-end getbased-marker-detail-owned-slot-2-end (getbased-marker-detail-owned-slot-3-endgetbased-marker-detail-owned-slot-4-end%) from getbased-marker-detail-owned-slot-5-end to getbased-marker-detail-owned-slot-6-end</div>",
  "value-note": "<div class=\"mv-value-note has-note\"><span class=\"mv-value-note-text\" role=\"button\" tabindex=\"0\" title=\"Click to edit note\" data-marker-detail-owned-edit-actions=\"getbased-marker-detail-owned-slot-0-end\">getbased-marker-detail-owned-slot-1-end</span> <button class=\"mv-value-note-delete\" title=\"Remove note\" data-marker-detail-owned-delete-actions=\"getbased-marker-detail-owned-slot-2-end\">\u00d7</button></div>"
} as const;

export const markerDetailCompilerAnchorPositions = {
  "band": [
    0,
    8,
    586,
    594
  ],
  "low-zone": [
    0,
    8,
    141,
    149
  ],
  "high-zone": [
    0,
    8,
    180,
    188
  ],
  "optimal-zone": [
    0,
    8,
    155,
    163
  ],
  "edited-badge": [
    0,
    8,
    300,
    308
  ],
  "edit-control": [
    0,
    8,
    384,
    392
  ],
  "suggestion": [
    0,
    8,
    280,
    288
  ],
  "phase": [
    0,
    8,
    166,
    174
  ],
  "date-note": [
    0,
    8,
    214,
    222
  ],
  "manual-revert": [
    0,
    8,
    268,
    276
  ],
  "manual-badge": [
    0,
    8,
    87,
    95
  ],
  "delete-value": [
    0,
    8,
    154,
    162
  ],
  "value-note": [
    0,
    8,
    422,
    430
  ],
  "add-note": [
    0,
    8,
    201,
    209
  ],
  "alternate-value": [
    0,
    8,
    159,
    167
  ],
  "row": [
    0,
    8,
    916,
    924
  ],
  "more": [
    0,
    8,
    181,
    189
  ],
  "last-values": [
    0,
    8,
    199,
    207
  ],
  "trend": [
    0,
    8,
    368,
    376
  ],
  "collection-context": [
    0,
    8,
    98,
    106
  ],
  "source-file": [
    0,
    8,
    134,
    142
  ],
  "source-edited": [
    0,
    8,
    79,
    87
  ],
  "source-report": [
    0,
    8,
    101,
    109
  ],
  "source-manual": [
    0,
    8,
    76,
    84
  ],
  "reference": [
    0,
    8,
    893,
    901
  ]
} as const;
