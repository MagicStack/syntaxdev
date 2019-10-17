#!/usr/bin/env node

'use strict';


var syntaxdev = require('../index'),
    argparse = require('argparse'),
    packageInfo = require('../package.json'),
    _ = require('underscore');


var cli = new argparse.ArgumentParser({
    prog:    packageInfo.name,
    version: packageInfo.version,
    addHelp: true
});

var sub = cli.addSubparsers({
    dest:    'command'
});


var listCli = sub.addParser('scopes');

listCli.addArgument([ '--syntax' ], {
    help: 'Syntax file in YAML format, ex: "--syntax FooLang.YAML-tmLanguage"',
    required: true
});


var testCli = sub.addParser('test');

testCli.addArgument([ '--tests' ], {
    help: 'Test files, ex: "--tests test/**/*.test"',
    nargs: '*',
    action: 'append',
    required: true
});

testCli.addArgument([ '--no-color' ], {
    help: "Don't use colored output",
    action: 'storeTrue',
    default: false
});

testCli.addArgument([ '--overwrite-tests' ], {
    help: "Overwrite output for tests with the current output",
    action: 'storeTrue',
    default: false
});

testCli.addArgument([ '--syntax' ], {
    help: 'Syntax file in YAML format, ex: "--syntax FooLang.YAML-tmLanguage"',
    required: true
});

testCli.addArgument([ '--add-syntax' ], {
    help: 'Additional syntax files in YAML format',
    nargs: '*',
    action: 'append'
});


var atomSpecCli = sub.addParser('atom-spec');

atomSpecCli.addArgument([ '--tests' ], {
    help: 'Test files, ex: "--tests test/**/*.test"',
    nargs: '*',
    action: 'append',
    required: true
});

atomSpecCli.addArgument([ '--syntax' ], {
    help: 'Syntax file in YAML format, ex: "--syntax FooLang.YAML-tmLanguage"',
    required: true
});

atomSpecCli.addArgument([ '--add-syntax' ], {
    help: 'Additional syntax files in YAML format',
    nargs: '*',
    action: 'append'
});

atomSpecCli.addArgument([ '--out' ], {
    help: '"out" JS file',
    required: true
});

atomSpecCli.addArgument([ '--package-name' ], {
    required: true
});


var buildCsonCli = sub.addParser('build-cson');

buildCsonCli.addArgument([ '--in' ], {
    help: '"in" YAML file',
    required: true
});

buildCsonCli.addArgument([ '--out' ], {
    help: '"out" CSON file',
    required: true
});


var buildPListCli = sub.addParser('build-plist');

buildPListCli.addArgument([ '--in' ], {
    help: '"in" YAML file',
    required: true
});

buildPListCli.addArgument([ '--out' ], {
    help: '"out" PList file',
    required: true
});


function main() {
    var options = cli.parseArgs();

    if (options.command == 'test') {
        syntaxdev.test(
            _.chain(options.tests).flatten().uniq().sort().value(),
            options.syntax,
            {
                no_color: options.no_color,
                overwrite_tests: options.overwrite_tests,
                add_syntaxes: _.chain(options.add_syntax).flatten().
                                                    uniq().sort().value()
            }
        );
    } else if (options.command == 'atom-spec') {
        syntaxdev.generateAtomSpec(
            _.chain(options.tests).flatten().uniq().sort().value(),
            options.syntax,
            {
                out: options.out,
                add_syntaxes: _.chain(options.add_syntax).flatten().
                                                    uniq().sort().value(),
                packageName: options.package_name,
            }
        );
    } else if (options.command == 'build-cson') {
        syntaxdev.buildCson(options.in, options.out);
    } else if (options.command == 'build-plist') {
        syntaxdev.buildPList(options.in, options.out);
    } else if (options.command == 'scopes') {
        console.log(syntaxdev.listScopes(options.syntax).join('\n'));
    }
}


main();
