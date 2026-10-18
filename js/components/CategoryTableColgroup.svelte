<script lang="ts">let {columns}:{columns:readonly string[]}=$props();</script><svelte:options preserveWhitespace/><colgroup>{#each columns as className}<col class={className}>{/each}</colgroup>
