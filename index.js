'use strict';


var chalk   = require("chalk"),
    fs      = require("fs"),
    yaml    = require("js-yaml"),
    mate    = require("first-mate"),
    jsdiff  = require("diff"),
    temp    = require("temp").track(),
    _       = require("underscore"),
    cson    = require("cson"),
    plist   = require("plist"),
    path    = require("path");


function readGrammarFile(filename, significantScopeLast) {
    /*
    Args:
        - `significantScopeLast`: if set to `true`, scopes separated by
          whitespace will be outputted in reverse.  In ST scopes specified
          last have more weight than scopes that specified first; in Atom
          it's reversed.  In MagicPython, we specify scopes putting
          significant scopes first, hence, we need to reverse scopes
          when we generate schema for SublimeText.
    */

    function read(filename, vars) {
        var yamlSource = fs.readFileSync(filename, 'utf8'),
            hop = Object.prototype.hasOwnProperty;

        if (vars) {
            yamlSource = yamlSource.replace(
                /\$\{(\w+)\}/g,
                function(all, name) {
                    if (name && hop.call(vars, name)) {
                        return vars[name];
                    } else {
                        return all;
                    }
                });
        }

        var schema = yaml.safeLoad(yamlSource);

        if (schema.repository
            && schema.repository.$apply
            && schema.repository.$apply instanceof Array)
        {
            var specs = schema.repository.$apply;
            for (var i = 0; i < specs.length; i++) {
                var spec = specs[i];

                var inner = read(path.join(path.dirname(filename),
                                           spec.file),
                                 spec.vars);

                _.extend(schema.repository, inner.repository);
            }

            delete schema.repository.$apply;
        }

        return schema;
    }

    function patch(o) {
        function patchName(name) {
            var names = name.split(/[\s\n]+/);
            if (names.length > 1) {
                names.reverse();
            }
            return names.join(' ');
        }

        if (_.has(o, 'name')) {
            o.name = patchName(o.name);
        }

        if (_.has(o, 'patterns')) {
            _.each(o.patterns, patch);
        }

        _.each(
            ['beginCaptures', 'endCaptures', 'captures'],
            function(prop) {
                if (!_.has(o, prop)) {
                    return
                }

                _.each(o[prop], function(v) {
                    if (_.has(v, 'name')) {
                        v.name = patchName(v.name);
                    }
                })
            }
        );
    }

    var schema = read(filename, {});

    if (significantScopeLast) {
        if (schema.repository) {
            _.each(schema.repository, function(v, k) {
                patch(v);
            });
        }
    }

    return schema;
}


function compileGrammar(grammarFile, additionalGrammars) {
    function _compile(filename, registry) {
        var tmp = temp.openSync();

        try {
            var yamlSchema = readGrammarFile(filename, false);

            fs.writeSync(tmp.fd, JSON.stringify(yamlSchema));
            fs.closeSync(tmp.fd);

            return registry.loadGrammarSync(tmp.path);
        }
        finally {
            temp.cleanupSync();
        }
    }

    var registry = new mate.GrammarRegistry,
        grammar = _compile(grammarFile, registry);

    if (additionalGrammars) {
        for (var i = 0; i < additionalGrammars.length; i++) {
            _compile(additionalGrammars[i], registry);
        }
    }

    return grammar;
}


function stripnl(str){
    return str.replace(/^\n+/, '').replace(/\n+$/, '');
}


function readTestFile(file) {
    function rpartition(str, separator) {
        if (!separator) {
            throw new Error('empty separator')
        }

        var seplen = separator.length,
            lastpos = str.lastIndexOf(separator);

        if (lastpos != -1) {
            return [str.substr(0, lastpos),
                    separator,
                    str.substr(lastpos + seplen)];
        }
        else {
            return ['', '', str];
        }
    }

    var buf = fs.readFileSync(file, 'utf8'),
        parts = rpartition(buf, '\n\n\n'),
        source = parts[0],
        test = parts[2];

    if (test) {
        test = stripnl(test);
    }

    if (source) {
        source = stripnl(source);
    }

    if (!test) {
        test = null;
    }

    if (!source) {
        source = null;
    }

    if (!source && test) {
        source = test;
        test = null;
    }

    return {
        source: source,
        test: test
    }
}


function testFile(file, grammar, options) {
    function padRight(str, pad) {
        if (str.length < pad) {
            return str + (new Array(pad - str.length)).join(' ');
        }

        return str;
    }

    function tokenize(lines) {
        var lines = grammar.tokenizeLines(lines),
            result = [];

        result = []
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];

            for (var j = 0; j < line.length; j++) {
                var value = line[j].value,
                    scopes = line[j].scopes;

                result.push(
                    [
                        padRight(value, 14),
                        ' : ',

                        _.chain(scopes)
                         .flatten()
                         .reduce(
                            function(m, v) {
                              m.push.apply(m, v.split(/\s+/g));
                              return m;
                            },
                            []
                          )
                         .uniq()
                         .sort()
                         .value()
                         .join(', ')
                    ].join('')
                )
            }
        }

        return result.join('\n')
    }

    function getDiff(test, result) {
        var diff = jsdiff.structuredPatch('', '', test, result, '', ''),
            result = [];

        for (var i = 0; i < diff.hunks.length; i++) {
            var hunk = diff.hunks[i];

            for (var j = 0; j < hunk.lines.length; j++) {
                var line = hunk.lines[j];
                if (line && !options.no_color) {
                    if (line[0] == '+') {
                        line = chalk.green(line)
                    } else if (line[0] == '-') {
                        line = chalk.red(line)
                    }
                }
                result.push(line);
            }

            result.push('@@@@@@')
        }

        result.pop();
        return result.join('\n');
    }

    var testFile = readTestFile(file),
        source = testFile.source,
        test = testFile.test;

    if (!source) {
        return {
            file: file,
            status: 'fail',
            error: 'Empty file'
        }
    }

    var result = tokenize(source);

    if (test != result) {
        if (test) {
            return {
                file: file,
                status: 'fail',
                error: 'Output different from expected',
                body: getDiff(test, result)
            }
        } else {
            return {
                file: file,
                status: 'fail',
                error: 'No expected output set',
                body: result
            }
        }
    } else {
        return {
            file: file,
            status: 'pass'
        }
    }
}


function test(testFiles, grammarFile, options) {
    options = options || {};

    var grammar = compileGrammar(grammarFile, options.add_syntaxes),
        sep = '--------',
        passed = 0,
        failed = 0,
        failedRes = [];

    console.log(sep);
    console.log(testFiles.length + ' tests; grammar: ' + grammarFile);
    console.log(sep);

    for (var i = 0; i < testFiles.length; i++) {
        var res = testFile(testFiles[i], grammar, options);

        if (res.status == 'fail') {
            process.stdout.write('E');
            failed ++;
            failedRes.push(res);
        } else {
            process.stdout.write('.');
            passed ++;
        }
    }
    process.stdout.write('\n');

    console.log(sep);
    console.log(passed + ' passed; ' + failed + ' failed.');
    console.log(sep);

    for (var i = 0; i < failedRes.length; i++) {
        var res = failedRes[i];

        console.log(sep);
        console.log('Failed test ' + res.file + ': ' + res.error);
        console.log(sep);
        if (res.body) {
            console.log(res.body)
        }
    }

    if (failed) {
        process.exit(1);
    }
}


function generateAtomSpec(testFiles, grammarFile, options) {
    var grammar = compileGrammar(grammarFile, options.add_syntaxes),
        specLines = [];

        console.log(grammar.scopeName);

    for (var fi = 0; fi < testFiles.length; fi++) {
        var fileName = testFiles[fi],
            testFile = readTestFile(fileName);

        if (!testFile.test || !testFile.source) {
            continue;
        }

        var lines = grammar.tokenizeLines(testFile.source),
            testLines = [];

        testLines.push(
            'tokens = grammar.tokenizeLines(' +
            JSON.stringify(testFile.source) +
            ')')

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];

            for (var j = 0; j < line.length; j++) {
                var value = line[j].value,
                    scopes = line[j].scopes;

                testLines.push(
                    'expect(tokens[' + i + '][' + j + '].value)' +
                    '.toBe(' + JSON.stringify(value) + ');')

                testLines.push(
                    'expect(tokens[' + i + '][' + j + '].scopes)' +
                    '.toEqual(' + JSON.stringify(scopes) + ');')
            }
        }

        specLines.push({
            file: fileName,
            lines: testLines
        })
    }

    var buf = [
        '// !!! autogenerated; do not edit !!!\n\n\n',
        'describe("Grammar Tests", function() {',
        '  var grammar = null;',
        '  beforeEach(function() {',
        '    waitsForPromise(function() {',
        '      return atom.packages.activatePackage(' +
                    JSON.stringify(options.packageName) + ')',
        '    });',
        '    runs(function() {',
        '      grammar = atom.grammars.grammarForScopeName(' +
                    JSON.stringify(grammar.scopeName) + ')',
        '    });',
        '  });',
        ''
    ];

    for (i = 0; i < specLines.length; i++) {
        buf.push('  it(' + JSON.stringify(specLines[i].file) + ', ');
        buf.push('  function() {')
        buf.push('    ' + specLines[i].lines.join('\n    '));
        buf.push('  });');
    }

    buf.push('});\n');
    buf = buf.join('\n');

    fs.writeFileSync(options.out, buf + '\n');
}


function buildCson(inName, outName) {
    var yamlSchema = readGrammarFile(inName, false),
        csonSource = cson.createCSONString(yamlSchema, {indent: 2});

    csonSource = '# AUTOGENERATED FROM ' + inName + '\n' + csonSource;
    fs.writeFileSync(outName, csonSource + '\n');
}


function buildPList(inName, outName) {
    var yamlSchema = readGrammarFile(inName, true),
        plistSource = plist.build(yamlSchema);

    plistSource = '<!-- AUTOGENERATED FROM ' + inName + ' -->\n' +
                  plistSource;

    fs.writeFileSync(outName, plistSource + '\n');
}


function listScopes(grammarFile) {
    var schema = readGrammarFile(grammarFile),
        scopes = [];

    function addName(name) {
        scopes.push.apply(scopes, name.split(/\s+/g));
    }

    function visit(o) {
        if (_.has(o, 'name')) {
            addName(o.name);
        }

        if (_.has(o, 'patterns')) {
            _.each(o.patterns, visit);
        }

        _.each(
            ['beginCaptures', 'endCaptures', 'captures'],
            function(prop) {
                if (!_.has(o, prop)) {
                    return
                }

                _.each(o[prop], function(v) {
                    if (_.has(v, 'name')) {
                        addName(v.name);
                    }
                })
            }
        );
    }

    if (schema.repository) {
        _.each(schema.repository, function(v, k) {
            visit(v);
        });
    }

    return _.chain(scopes).uniq().sort().value();
}


module.exports = {
    test: test,
    generateAtomSpec: generateAtomSpec,
    buildCson: buildCson,
    buildPList: buildPList,
    listScopes: listScopes
};
