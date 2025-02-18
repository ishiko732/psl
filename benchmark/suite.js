import vm from 'node:vm';
import benchmark from 'benchmark';
import psl from '../index.js';

const runSuite = ({ module, version }) => new Promise((resolve, reject) => {
  const suite = new benchmark.Suite(version);

  suite.add('psl#isValid', {
    fn: () => {
      module.isValid('google.com');
    }
  });

  suite.add('psl#parse', {
    fn: () => {
      module.parse('google.com');
    }
  });

  suite.add('psl#parse invalid domain', {
    fn: () => {
      module.parse('google.comp');
    }
  });

  suite.on('error', reject);

  suite.on('complete', () => {
    resolve(suite.map(test => ({ version, ...test })));
  });

  suite.run({ async: true });
});

const runSuites = (suites) => {
  const recurse = async (remaining, memo) => {
    if (!remaining.length) {
      return memo;
    }

    return recurse(remaining.slice(1), memo.concat(await runSuite(remaining[0])));
  };

  return recurse(suites, [])
};

const printResults = (results, compareToVersion) => {
  const parsedResults = results.map(result => ({
    version: result.version,
    name: result.name,
    'ops/sec': parseInt(result.hz.toFixed(result.hz < 100 ? 2 : 0), 10),
    '\xb1 %': parseFloat(result.stats.rme.toFixed(2), 10),
    'runs sampled': result.stats.sample.length,
  }));

  console.table(parsedResults.reduce(
    (memo, { version, name, ...rest }) => ({
      ...memo,
      [`[${version}] ${name}`]: rest,
    }),
    {},
  ));

  const resultsByFunc = parsedResults.reduce(
    (memo, result) => ({
      ...memo,
      [result.name]: {
        ...memo[result.name],
        [result.version]: result['ops/sec'],
      },
    }),
    {},
  );

  const resultsByFuncSummary = Object.keys(resultsByFunc).reduce(
    (memo, name) => {
      const sourceOpsXSec = parseInt(resultsByFunc[name].source, 10);
      const compareToOpsXSec = parseInt(resultsByFunc[name][compareToVersion], 10);
      const diff = (
        sourceOpsXSec > compareToOpsXSec
          ? `${(sourceOpsXSec / compareToOpsXSec).toFixed(2)}x up`
          : `${(compareToOpsXSec / sourceOpsXSec).toFixed(2)}x down`
      );

      return memo.concat({
        name,
        ...resultsByFunc[name],
        diff,
      });
    },
    [],
  );

  console.table(resultsByFuncSummary.reduce(
    (memo, { name, ...rest }) => ({ ...memo, [name]: rest }),
    {},
  ));
};

const fetchModule = async (version) => {
  const url = `https://unpkg.com/psl@${version}/dist/psl.mjs`;
  const response = await fetch(url);
  const text = await response.text();
  const mod = new vm.SourceTextModule(text);

  await mod.link(() => { });
  await mod.evaluate();

  return mod.namespace;
};

const main = async () => {
  const compareToVersion = 'v1.13.0';

  const results = await runSuites([
    { module: psl, version: 'source' },
    { module: await fetchModule(compareToVersion), version: compareToVersion },
  ]);

  printResults(results, compareToVersion);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
