<svelte:options preserveWhitespace={true}/><script lang="ts">
  let {count,plural}:{count:string;plural:''|'s'}=$props();
</script><div class="db-genome-list">
        <div class="db-genome-summary">{count} imported SNP{plural}</div>
        <div class="db-genome-empty db-genome-loading" aria-live="polite">
          <strong>Loading SNP interpretations</strong>
          <span>Matching your variants to the SNP catalog so effect, category, and notes render correctly.</span>
        </div>
      </div>