/* ==========================================================================
   languages.js — which words are keywords, types, built-ins, etc. for each
   language. The tokenizer in highlighter.js reads these definitions.

   Token kinds and what they color:
     keyword   declarations (const, def, class)      control  flow (if, return, import)
     constant  true / false / null                    builtin  print, console, Math
     type      class & type names                     function names followed by "("
     variable  other identifiers                      property after a "."
   ========================================================================== */
(function (SC) {
  'use strict';

  const words = (s) => new Set(s.trim().split(/\s+/));

  const javascript = {
    id: 'javascript', name: 'JavaScript', exts: ['js', 'mjs', 'cjs', 'jsx'],
    lineComment: '//', blockComment: ['/*', '*/'],
    strings: ['"', "'"], template: '`', regex: true, decorators: true,
    ident: /^[A-Za-z_$À-￿][\w$À-￿]*/,
    keywords: words('const let var function class extends new this super typeof instanceof in of void delete async await static get set yield debugger with'),
    control: words('if else for while do switch case default break continue return throw try catch finally import export from as'),
    constants: words('true false null undefined NaN Infinity'),
    builtins: words('console window document Math JSON Object Array String Number Boolean Promise Map Set WeakMap Symbol Date RegExp Error parseInt parseFloat setTimeout setInterval clearTimeout clearInterval fetch require module exports globalThis localStorage navigator alert'),
    defKeywords: words('function'),
    typeKeywords: words('class extends new instanceof implements interface type enum'),
  };

  const typescript = Object.assign({}, javascript, {
    id: 'typescript', name: 'TypeScript', exts: ['ts', 'tsx', 'mts', 'cts'],
    keywords: new Set([...javascript.keywords, ...words('interface type enum implements namespace declare readonly public private protected abstract keyof infer is asserts satisfies override')]),
    types: words('string number boolean any unknown never void object bigint symbol'),
  });

  const python = {
    id: 'python', name: 'Python', exts: ['py', 'pyw', 'pyi'],
    lineComment: '#', strings: ['"', "'"], triple: true, decorators: true,
    stringPrefix: /^(r|u|b|f|br|rb|fr|rf)$/i,
    keywords: words('def class lambda and or not is in global nonlocal pass del async await'),
    control: words('if elif else for while break continue return try except finally raise with as import from yield assert match case'),
    constants: words('True False None self cls __name__ __main__'),
    builtins: words('print len range int str float list dict set tuple bool open input type isinstance issubclass enumerate zip map filter sorted sum min max abs round super object Exception ValueError TypeError KeyError IndexError any all repr id hash iter next reversed format getattr setattr hasattr vars dir help'),
    defKeywords: words('def'),
    typeKeywords: words('class'),
  };

  const cFamilyControl = 'if else for while do switch case default break continue return goto try catch throw';

  const c = {
    id: 'c', name: 'C', exts: ['c', 'h'],
    lineComment: '//', blockComment: ['/*', '*/'], strings: ['"', "'"], preprocessor: true,
    keywords: words('auto const extern register static volatile struct union enum typedef sizeof inline restrict'),
    control: words(cFamilyControl),
    constants: words('NULL true false EOF'),
    types: words('int char float double void long short unsigned signed bool size_t FILE uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t'),
    builtins: words('printf scanf malloc calloc free memcpy memset strlen strcpy strcmp fopen fclose fprintf puts exit'),
    typeKeywords: words('struct union enum'),
  };

  const cpp = Object.assign({}, c, {
    id: 'cpp', name: 'C++', exts: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'],
    keywords: new Set([...c.keywords, ...words('class namespace template typename public private protected virtual override final friend operator new delete this using constexpr noexcept explicit mutable auto decltype nullptr_t')]),
    constants: words('nullptr true false NULL'),
    types: new Set([...c.types, ...words('string vector map set pair unique_ptr shared_ptr')]),
    builtins: words('std cout cin endl cerr printf make_unique make_shared move'),
    typeKeywords: words('class struct union enum namespace typename new'),
  });

  const java = {
    id: 'java', name: 'Java', exts: ['java'],
    lineComment: '//', blockComment: ['/*', '*/'], strings: ['"', "'"], decorators: true,
    keywords: words('class interface enum extends implements new this super public private protected static final abstract synchronized volatile transient native package var record sealed permits instanceof'),
    control: words(cFamilyControl + ' finally throws import assert'),
    constants: words('true false null'),
    types: words('int long short byte char float double boolean void String Object Integer List Map ArrayList HashMap'),
    builtins: words('System Math'),
    typeKeywords: words('class interface enum extends implements new instanceof record'),
  };

  const csharp = {
    id: 'csharp', name: 'C#', exts: ['cs'],
    lineComment: '//', blockComment: ['/*', '*/'], strings: ['"', "'"], preprocessor: true,
    keywords: words('class interface struct enum record namespace using new this base public private protected internal static readonly const abstract virtual override sealed async await var get set value partial ref out in params is as typeof nameof event delegate operator'),
    control: words(cFamilyControl + ' finally foreach yield when'),
    constants: words('true false null'),
    types: words('int long short byte char float double decimal bool void string object dynamic List Dictionary Task'),
    builtins: words('Console Math'),
    typeKeywords: words('class interface struct enum record new is as'),
  };

  const rust = {
    id: 'rust', name: 'Rust', exts: ['rs'],
    lineComment: '//', blockComment: ['/*', '*/'], strings: ['"', "'"], macros: true, lifetimes: true,
    keywords: words('fn let mut const static struct enum trait impl type pub crate mod use self Self super where as ref move dyn unsafe async await extern'),
    control: words('if else match for while loop break continue return in'),
    constants: words('true false None Some Ok Err'),
    types: words('i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box HashMap'),
    defKeywords: words('fn'),
    typeKeywords: words('struct enum trait impl type'),
  };

  const go = {
    id: 'go', name: 'Go', exts: ['go'],
    lineComment: '//', blockComment: ['/*', '*/'], strings: ['"', "'", '`'],
    keywords: words('func var const type struct interface map chan package import go defer select'),
    control: words('if else for range switch case default break continue return goto fallthrough'),
    constants: words('true false nil iota'),
    types: words('int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float32 float64 string bool byte rune error any'),
    builtins: words('fmt len cap make new append copy delete panic recover print println'),
    defKeywords: words('func'),
    typeKeywords: words('type'),
  };

  const shell = {
    id: 'shell', name: 'Shell Script', exts: ['sh', 'bash', 'zsh'],
    lineComment: '#', strings: ['"', "'"], dollarVars: true, capsAsConstants: false,
    ident: /^[A-Za-z_][\w-]*/,
    keywords: words('function local export readonly declare unset alias source'),
    control: words('if then else elif fi for while until do done case esac in return exit break continue select'),
    constants: words('true false'),
    builtins: words('echo printf cd ls pwd cat grep sed awk mkdir rm cp mv touch chmod sudo npm git node python pip read test'),
  };

  const sql = {
    id: 'sql', name: 'SQL', exts: ['sql'],
    lineComment: '--', blockComment: ['/*', '*/'], strings: ["'", '"'], caseInsensitive: true, capsAsTypes: false,
    keywords: words('select from where insert into values update set delete create table drop alter add column primary key foreign references index view as and or not null is in like between join inner left right outer full on group by order having limit offset distinct union all exists case when then else end default unique constraint asc desc database'),
    control: words('begin commit rollback transaction return if'),
    constants: words('true false'),
    types: words('int integer bigint smallint varchar char text boolean date datetime timestamp float double decimal numeric serial'),
    builtins: words('count sum avg min max now coalesce lower upper length'),
  };

  const json = {
    id: 'json', name: 'JSON', exts: ['json', 'jsonc', 'webmanifest'],
    lineComment: '//', blockComment: ['/*', '*/'], strings: ['"'], keyColon: true,
    keywords: words(''), control: words(''), constants: words('true false null'),
  };

  const lua = {
    id: 'lua', name: 'Lua', exts: ['lua'],
    lineComment: '--', strings: ['"', "'"],
    keywords: words('local function and or not end'),
    control: words('if then else elseif for while do repeat until return break in goto'),
    constants: words('true false nil'),
    builtins: words('print pairs ipairs type tostring tonumber require table string math'),
    defKeywords: words('function'),
  };

  const ruby = {
    id: 'ruby', name: 'Ruby', exts: ['rb'],
    lineComment: '#', strings: ['"', "'"],
    keywords: words('def class module end do self super and or not alias lambda proc attr_accessor attr_reader require'),
    control: words('if elsif else unless case when while until for in return break next begin rescue ensure yield then'),
    constants: words('true false nil'),
    builtins: words('puts print p gets'),
    defKeywords: words('def'),
    typeKeywords: words('class module'),
  };

  const yaml = {
    id: 'yaml', name: 'YAML', exts: ['yml', 'yaml'],
    lineComment: '#', strings: ['"', "'"], keyColon: true, yamlKeys: true, capsAsTypes: false,
    ident: /^[A-Za-z_][\w-]*/,
    keywords: words(''), control: words(''), constants: words('true false null yes no on off'),
  };

  // Languages with their own tokenizers in highlighter.js
  const html = { id: 'html', name: 'HTML', exts: ['html', 'htm', 'xml', 'svg', 'xhtml', 'vue'], custom: 'html' };
  const css = { id: 'css', name: 'CSS', exts: ['css', 'scss', 'less'], custom: 'css' };
  const markdown = { id: 'markdown', name: 'Markdown', exts: ['md', 'markdown', 'mdx'], custom: 'markdown' };
  const plaintext = { id: 'plaintext', name: 'Plain Text', exts: ['txt', 'log', 'text'], custom: 'plain' };

  const all = [plaintext, javascript, typescript, python, html, css, json, markdown, c, cpp, csharp, java, rust, go, shell, sql, lua, ruby, yaml];
  const byId = Object.fromEntries(all.map((l) => [l.id, l]));
  const ALIASES = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'shell', bash: 'shell', zsh: 'shell', 'c++': 'cpp', 'c#': 'csharp', cs: 'csharp', rs: 'rust', md: 'markdown', yml: 'yaml', text: 'plaintext', txt: 'plaintext', jsx: 'javascript', tsx: 'typescript', xml: 'html', svg: 'html', scss: 'css' };

  function forPath(path) {
    const base = SC.util.basename(path).toLowerCase();
    if (base === 'dockerfile' || base === 'makefile') return shell;
    if (base === '.gitignore' || base === '.env') return shell;
    const ext = SC.util.extname(path);
    return all.find((l) => l.exts.includes(ext)) || plaintext;
  }

  /** Look up by id, alias, extension or display name ("Python", "py", "c++"). */
  function find(name) {
    if (!name) return null;
    const key = String(name).toLowerCase().trim();
    return byId[key] || byId[ALIASES[key]] || all.find((l) => l.exts.includes(key) || l.name.toLowerCase() === key) || null;
  }

  SC.languages = { all, byId, forPath, find };
})(window.SC);
