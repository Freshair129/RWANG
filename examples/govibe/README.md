# GoVibe Consumer Boundary

## Status

This directory is documentation and configuration shape only. It contains no GoVibe source copy, no vendored RWANG runtime, and no claim that an RWANG SDK has already been implemented or published.

GoVibe remains an external product repository. It may consume the canonical RWANG repository at:

```text
https://github.com/Freshair129/RWANG
```

The consumer cutover is approval-gated. Do not switch a production dependency until the [RWANG cutover compatibility contract](../../docs/COMPATIBILITY--RWANG-REPOSITORY-CUTOVER.md) reaches the cutover state.

## Configuration Shape

The following is an illustrative, non-executable shape for a GoVibe integration manifest:

```json
{
  "rwang": {
    "repository": "https://github.com/Freshair129/RWANG",
    "integration": "sdk-or-service-api",
    "adapterProfile": "project",
    "version": "owner-approved-release"
  }
}
```

`version` is a placeholder. It must be replaced by an owner-approved RWANG release or an explicitly approved commit reference. This example does not define a currently available SDK, service endpoint, package name, or authentication mechanism.

## Consumption Boundaries

- **SDK:** If a compatible RWANG SDK is published later, GoVibe may depend on its documented public contracts. This repository currently does not claim that such an SDK exists.
- **Service/API:** GoVibe may invoke a separately deployed RWANG service or API when an approved endpoint, authentication policy, and compatibility version exist. The endpoint and credentials remain deployment configuration outside this repository.
- **Adapters:** GoVibe may provide or configure adapters through documented RWANG contracts. Provider-specific behavior stays in adapters, not in the RWANG core contract.
- **Target repositories:** GenesisBlock, G-Maiden, and other target repositories remain external. GoVibe and RWANG may reference them through approved adapter or workflow configuration, but neither repository absorbs their source trees.

## Cutover Checklist

Before a GoVibe consumer PR changes its RWANG reference, verify:

1. PRs `#25`-`#28` are merged into `Freshair129/RWANG`.
2. A tagged RWANG release exists, or the owner has explicitly confirmed cutover without a tag.
3. The selected SDK/service/API/adapter contract is documented and versioned.
4. GoVibe has its own reviewed consumer PR; this example does not substitute for it.
