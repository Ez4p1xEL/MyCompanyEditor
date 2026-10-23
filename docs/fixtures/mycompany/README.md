# MyCompany 样例快照（fixtures）

本目录是 MyCompany 插件默认 YAML **上游 git blob（LF）的逐字节副本**，供编辑器测试、快照对比与回归使用。

> ⚠️ 数据来源是 **git blob**，不是 `reference/mycompany` 的**工作树文件**。
> 上游开发机/克隆若开启 `core.autocrlf=true`，工作树里的 `.yml` 会呈现 CRLF，字节数与 SHA256 都会与本目录不同。
> 复核本目录必须用 `git cat-file blob 6764e01:<路径>`（或 `git show`）取 blob 再比哈希，**不能**直接对工作树文件取哈希。

## 1. 来源

| 项 | 值 |
| --- | --- |
| 仓库 | https://github.com/Ez4p1xEL/MyCompany |
| 分支 | `master` |
| commit | `6764e01473e9814f012dc6bdc2fde1fa0f5b0d0f` |
| commit 时间 | 2026-10-23 23:28:58 +0800 |
| commit 标题 | `add focus setting features and update item handling in menus` |
| 插件版本 | `0.8.50` |
| 数据来源 | 该 commit 的 **git blob**（`git cat-file blob`），编码 UTF-8、换行 LF、无 BOM |
| 本地克隆 | `reference/mycompany`（已 gitignore；仅用于取 blob，不作为字节源） |

源路径前缀：`mycompany-core/src/main/resources/`。本目录保留其相对路径，例如
`mycompany-core/src/main/resources/menu/main.yml` → `menu/main.yml`。

## 2. 文件清单与 git blob 字节 / SHA256（23 个文件）

下表数值均为 **git blob @ `6764e01`** 的字节数与 SHA256（即本目录文件的实际值），不是工作树值。
全部文件：LF 换行、UTF-8 无 BOM、无 CR（`0x0D`）。

| 相对路径 | 字节 | SHA256 |
| --- | --- | --- |
| `orders.yml` | 2898 | `009EA16A9A265078494747D1E737A82B771E942EB7EB2CA4414C0F06A52FD931` |
| `focus.yml` | 328 | `7A7562077DE20E7DCB7D749591EEF28D2A3D722A167942E187382CF23B4E442E` |
| `menus.yml` | 97 | `EC96C2F261A5A5367B7CB2C24CD312453B3995A8639756EFD274FEC6204F1ECE` |
| `focus/none.yml` | 284 | `838BFD91276F111F478970DC619F0A0E9EDA4C23AB529C47F0D91C900F0C64C3` |
| `focus/mob.yml` | 7774 | `433D2C016FAFF00B4008609673A8CA64850C6B3C37F449A57E1ACC6091C33181` |
| `menu/area_list.yml` | 801 | `AB75573C4BBF8964B874413730ABAEF7ACE4477D049D5B8F284511352225C7A8` |
| `menu/area_rent_market.yml` | 647 | `70F1E822B8DDA5E14BE3801750A2088F96BF359D62DA2687CE1A918B13EC0E0F` |
| `menu/area_sale_market.yml` | 647 | `70F1E822B8DDA5E14BE3801750A2088F96BF359D62DA2687CE1A918B13EC0E0F` |
| `menu/area_trade_market.yml` | 251 | `483550E46D98DE7C28873F241D7461680F6823CCDF969E31C3C96D4119A55DD8` |
| `menu/areas.yml` | 437 | `4DA066AE39694D5806FB6D866E41AB662A07975F4B2F549E4C34C15D848AB000` |
| `menu/chestshop.yml` | 341 | `F7089439B95A987CED3A539EDC25AF9395BB7B836059EC3689794F989BC298B9` |
| `menu/confirmation.yml` | 284 | `A11C435F6F180A7D140F0B18C1E9FCDC756D4523FBC38FE65089DBAC9FC9B438` |
| `menu/focus.yml` | 1776 | `6F823C066440DEFFFD187BFCAF2515579CF18AEA5FAFA512F2CFC61638DEC67D` |
| `menu/focus_list.yml` | 1009 | `75E7B2688ED51D50EDE52F428C3DD4BE22384D10226BE77AF153CA85BB5738ED` |
| `menu/found.yml` | 207 | `6EC856252FA992CE7E5F68C6E990F407C5EF97D5B7A4C9EC33FAE787822CD71C` |
| `menu/internal_store.yml` | 320 | `E50B4BAB332921BA9A80E4F033374D99F2239E029FAC6DD83022BC7822C9CFB7` |
| `menu/main.yml` | 801 | `F7743C27071DF89F637A93F6B66939EAC487594B331FD1684AC8E5D8A2A9DA02` |
| `menu/orders.yml` | 653 | `279C2E0050BB6EDAAEFE9C27782C6A953223BBDDDE96EAC0E6059DC1B9CBA501` |
| `menu/personnel.yml` | 765 | `F807B9DD4195A4409848447B3A436732ED73966F6779565351498210996521BA` |
| `menu/player_list.yml` | 679 | `ACFCC90E765CFC786407A2A6AC34B4782AAB3A367BEA3158A08DFCD7F18BE01E` |
| `menu/position.yml` | 620 | `29A7C74A736C20668A9E7966520F2C612B8813CA1BE493EAB9AA3F69760C30AB` |
| `menu/position_list.yml` | 579 | `044A8CBFAF867335853A69CAA90760B95E7E8D062EF08F13D55262D6469C51A4` |
| `menu/position_permission_list.yml` | 1143 | `9CA490F0B03331F3E93E8D0D384CC5B1CB55869BD27B950B9D38EEAF93A2CBF9` |

## 3. 与上一快照（`564f62e`）的差异（同样按 git blob 比较）

- 23 个 blob 中**只有 `focus/none.yml` 变化**：第 11 行 `value-type: boolean` → `value_type: boolean`。
  - 旧 blob：284 B，SHA256 `2733498447E001BD5D3867F8B4DC20940355A2E452F332FF31C15F7B85C2ACB4`
  - 新 blob：284 B，SHA256 `838BFD91276F111F478970DC619F0A0E9EDA4C23AB529C47F0D91C900F0C64C3`
- 其余 22 个文件在 `564f62e..6764e01` 之间 blob 逐字节相同（`orders.yml`、`focus/mob.yml`、`focus.yml`、`menus.yml`、全部 `menu/*.yml`）。
- 结论：`value_type` 是当前唯一标准写法；旧 `value-type` 只作为旧服文件导入警告（见 `docs/mycompany-spec/focus.md` §4.1）。

## 4. 复核命令（PowerShell，必须对 git blob 校验）

在本仓库根目录运行（需先有 `reference/mycompany` 克隆，commit `6764e01` 存在）：

```powershell
$repo = 'reference/mycompany'
$rev  = '6764e01473e9814f012dc6bdc2fde1fa0f5b0d0f'
$res  = 'mycompany-core/src/main/resources'
$dst  = 'docs/fixtures/mycompany'
$files = @('orders.yml','focus.yml','menus.yml','focus/none.yml','focus/mob.yml') +
  (& git -C $repo ls-tree --name-only "${rev}:$res/menu" | ForEach-Object { 'menu/' + $_ })

$bad = 0
foreach ($rel in $files) {
  # 1) blob -> 临时文件（不读工作树）
  $tmp = Join-Path $env:TEMP ('blob_' + [guid]::NewGuid().ToString('N') + '.yml')
  Start-Process git -ArgumentList @('-C', $repo, 'cat-file', 'blob', "${rev}:$res/$rel") `
    -RedirectStandardOutput $tmp -NoNewWindow -Wait
  $blobSize = [int](& git -C $repo cat-file -s "${rev}:$res/$rel")
  $blobSha  = (Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash
  # 2) fixture
  $fixture  = Join-Path $dst $rel
  $fixSize  = (Get-Item -LiteralPath $fixture).Length
  $fixSha   = (Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash
  $bytes    = [System.IO.File]::ReadAllBytes($fixture)
  $hasCr    = ($bytes | Where-Object { $_ -eq 13 }).Count -gt 0
  $hasBom   = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
  if ($blobSize -ne $fixSize -or $blobSha -ne $fixSha -or $hasCr -or $hasBom) {
    Write-Host "MISMATCH $rel (blob=$blobSize/$blobSha, fixture=$fixSize/$fixSha, CR=$hasCr, BOM=$hasBom)"
    $bad++
  }
  Remove-Item -LiteralPath $tmp -Force
}
if ($bad -eq 0) {
  Write-Host "OK: $($files.Count) fixtures == git blob @ $rev (LF, UTF-8 no BOM)"
} else { exit 1 }
```

> 如果你只是想快速扫一遍换行：`Get-ChildItem docs/fixtures/mycompany -Recurse -Filter *.yml | ForEach-Object { if ((Get-Content -Raw -LiteralPath $_.FullName) -match "`r") { Write-Host "CRLF: $($_.FullName)" } }` 应无输出。

## 5. 使用约定

- 本目录**只读**：编辑器/测试不得写入，也不要把用户数据写进来。
- 本目录是 **LF blob**（无 CR），因此导入示例时不应触发前端 `YAML_CRLF` 警告；若出现，说明读取端未按 LF 归一化或读到了别的工作树副本。
- 测试用例可用本目录做“默认文件黄金样例”（golden fixtures）：导入 → 不改动 → 导出应得到**语义等价**的 YAML。
  注意**不能承诺逐字节等价**：上游有 4 个 blob 末尾没有换行（`orders.yml`、`focus.yml`、`menus.yml`、`menu/found.yml`），
  编辑器按导出策略会补单个末尾 LF，导出字节数可能比上游 blob 多 1（例如 `orders.yml` 2898 → 2899）；
  其余文件末尾已有 LF，不改动时通常可逐字节一致。
- 若上游再次更新，请用 `git cat-file blob` 重新导出并更新本 README 的 commit、字节数、SHA256 与复核命令；不要从工作树复制。
