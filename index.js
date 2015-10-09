'use strict';


var chalk   = require("chalk"),
    fs      = require("fs"),
    yaml    = require("js-yaml"),
    mate    = require("first-mate"),
    jsdiff  = require("diff"),
    temp    = require("temp").track(),
    _       = require('underscore');


function compileGrammar(grammarFile) {
    var tmp = temp.openSync();

    try {
        var yamlSource = fs.readFileSync(grammarFile, 'utf8'),
            yamlSchema = yaml.safeLoad(yamlSource);

        fs.writeSync(tmp.fd, JSON.stringify(yamlSchema));
        fs.closeSync(tmp.fd);

        var registry = new mate.GrammarRegistry,
            grammar = registry.loadGrammarSync(tmp.path);
    }
    finally {
        temp.cleanupSync();
    }

    return grammar;
}


function testFile(file, grammar, options) {
    function padRight(str, pad) {
        if (str.length < pad) {
            return str + (new Array(pad - str.length)).join(' ');
        }

        return str;
    }

    function stripnl(str){
        return str.replace(/^\n+/, '').replace(/\n+$/, '');
    }

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

    function tokenize(lines) {
        var lines = grammar.tokenizeLines(stripnl(lines)),
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
                        _.chain(scopes).uniq().sort().value().join(', ')
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

            return result.join('\n');
        }
    }

    var buf = fs.readFileSync(file, 'utf8'),
        parts = rpartition(buf, '\n\n\n'),
        source = parts[0],
        test = parts[2];

    if (test) {
        test = stripnl(test);
    }

    if (!test) {
        test = null;
    }

    if (!source && test) {
        source = test;
        test = null;
    }

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


function run(testFiles, grammarFile, options) {
    options = options || {};

    var grammar = compileGrammar(grammarFile),
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


module.exports = run;
