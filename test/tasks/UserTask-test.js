'use strict';

const {Engine} = require('../../lib');
const {EventEmitter} = require('events');
const Lab = require('lab');
const testHelpers = require('../helpers/testHelpers');

const lab = exports.lab = Lab.script();
const {beforeEach, describe, it} = lab;
const {expect, fail} = Lab.assertions;

const moddleOptions = {
  camunda: require('camunda-bpmn-moddle/resources/camunda')
};

describe('UserTask', () => {
  describe('behaviour', () => {
    const taskProcessXml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <userTask id="task">
          <extensionElements>
            <camunda:inputOutput>
              <camunda:inputParameter name="input">\${variables.message}</camunda:inputParameter>
              <camunda:outputParameter name="output">Signaled \${input} with \${result}</camunda:outputParameter>
            </camunda:inputOutput>
          </extensionElements>
        </userTask>
        <endEvent id="end" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
        <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
      </process>
    </definitions>`;

    let context;
    beforeEach((done) => {
      testHelpers.getContext(taskProcessXml, moddleOptions, (err, result) => {
        if (err) return done(err);
        context = result;
        done();
      });
    });

    describe('activate()', () => {
      it('returns activity api', (done) => {
        const task = context.getChildActivityById('task');
        const activityApi = task.activate();
        expect(activityApi).to.exist();
        done();
      });

      it('activity api has the expected properties', (done) => {
        const task = context.getChildActivityById('task');
        const activityApi = task.activate();
        expect(activityApi).to.include({
          id: 'task',
          type: 'bpmn:UserTask'
        });
        expect(activityApi.inbound).to.be.an.array().and.have.length(1);
        expect(activityApi.outbound).to.be.an.array().and.have.length(1);
        done();
      });

      it('activity api has the expected functions', (done) => {
        const task = context.getChildActivityById('task');
        const activityApi = task.activate();
        expect(activityApi.run, 'run').to.be.a.function();
        expect(activityApi.deactivate, 'deactivate').to.be.a.function();
        expect(activityApi.execute, 'execute').to.be.a.function();
        expect(activityApi.getState, 'getState').to.be.a.function();
        expect(activityApi.resume, 'resume').to.be.a.function();
        expect(activityApi.getApi, 'getApi').to.be.a.function();
        done();
      });
    });

    describe('events', () => {
      it('emits start on taken inbound', (done) => {
        const task = context.getChildActivityById('task');
        task.activate();
        task.once('start', () => {
          done();
        });

        task.inbound[0].take();
      });

      it('leaves on discarded inbound', (done) => {
        const task = context.getChildActivityById('task');
        task.activate();
        task.once('start', () => {
          fail('No start should happen');
        });
        task.once('leave', () => {
          done();
        });

        task.inbound[0].discard();
      });

      it('emits wait after start when inbound taken', (done) => {
        const task = context.getChildActivityById('task');

        task.activate();

        const eventNames = [];
        task.once('start', () => {
          eventNames.push('start');
        });
        task.once('wait', (activity) => {
          expect(activity.id).to.equal('task');
          expect(eventNames).to.equal(['start']);
          done();
        });

        task.inbound[0].take();
      });

      it('emits end when signal() is called', (done) => {
        const task = context.getChildActivityById('task');

        task.activate();

        const eventNames = [];
        task.once('start', () => {
          eventNames.push('start');
        });
        task.once('wait', (activityApi, executionContext) => {
          eventNames.push('wait');
          executionContext.signal();
        });
        task.once('end', () => {
          expect(eventNames).to.equal(['start', 'wait']);
          done();
        });

        task.inbound[0].take();
      });

      it('emits leave when signal() is called', (done) => {
        const task = context.getChildActivityById('task');

        task.activate();

        task.once('wait', (activityApi, executionContext) => {
          executionContext.signal();
        });
        task.once('leave', () => {
          done();
        });

        task.inbound[0].take();
      });
    });

    describe('getState()', () => {
      it('returns expected state on events', (done) => {
        const task = context.getChildActivityById('task');
        task.activate();
        task.once('enter', (activityApi, executionApi) => {
          expect(activityApi.getApi(executionApi).getState()).to.equal({
            id: 'task',
            type: 'bpmn:UserTask',
            entered: true
          });
        });
        task.once('start', (activityApi, executionApi) => {
          expect(activityApi.getApi(executionApi).getState()).to.equal({
            id: 'task',
            type: 'bpmn:UserTask',
            entered: true
          });
        });
        task.once('wait', (activityApi, executionApi) => {
          expect(activityApi.getApi(executionApi).getState()).to.equal({
            id: 'task',
            type: 'bpmn:UserTask',
            entered: true,
            waiting: true
          });
          executionApi.signal();
        });
        task.once('end', (activityApi, executionApi) => {
          expect(activityApi.getApi(executionApi).getState()).to.equal({
            id: 'task',
            type: 'bpmn:UserTask',
            entered: undefined,
            waiting: undefined,
            taken: true
          });
        });
        task.once('leave', (activityApi, executionApi) => {
          expect(activityApi.getApi(executionApi).getState()).to.equal({
            id: 'task',
            type: 'bpmn:UserTask',
            entered: undefined,
            waiting: undefined,
            taken: true
          });
          done();
        });

        task.inbound[0].take();
      });
    });
  });

  describe('IO', () => {
    const taskProcessXml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <userTask id="task">
          <extensionElements>
            <camunda:inputOutput>
              <camunda:inputParameter name="input">\${variables.message}</camunda:inputParameter>
              <camunda:outputParameter name="output">Signaled \${input} with \${result}</camunda:outputParameter>
            </camunda:inputOutput>
          </extensionElements>
        </userTask>
        <endEvent id="end" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
        <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
      </process>
    </definitions>`;

    let context;
    beforeEach((done) => {
      testHelpers.getContext(taskProcessXml, moddleOptions, (err, result) => {
        if (err) return done(err);
        context = result;
        done();
      });
    });

    it('event argument getInput() on start returns input parameters', (done) => {
      context.environment.assignVariables({
        message: 'executed'
      });

      const task = context.getChildActivityById('task');
      task.activate();
      task.once('start', (activityApi, executionContext) => {
        expect(executionContext.getInput()).to.equal({
          input: 'executed'
        });
        done();
      });

      task.inbound[0].take();
    });

    it('event argument getOutput() on end returns output parameter value based on signal and input parameters', (done) => {
      context.environment.set('message', 'who');

      const task = context.getChildActivityById('task');
      task.activate();
      task.once('wait', (activityApi, executionContext) => {
        executionContext.signal('me');
      });

      task.once('end', (activityApi, executionContext) => {
        expect(executionContext.getOutput()).to.equal({
          output: 'Signaled who with me'
        });
        done();
      });

      task.inbound[0].take();
    });
  });

  describe('engine', () => {
    it('multiple inbound completes process', (done) => {
      const processXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="testProcess" isExecutable="true">
          <startEvent id="start" />
          <userTask id="task">
            <extensionElements>
              <camunda:inputOutput>
                <camunda:inputParameter name="input">\${variables.defaultTaken}</camunda:inputParameter>
                <camunda:outputParameter name="taskOutput">\${result}</camunda:outputParameter>
              </camunda:inputOutput>
            </extensionElements>
          </userTask>
          <exclusiveGateway id="decision" default="flow3">
            <extensionElements>
              <camunda:inputOutput>
                <camunda:outputParameter name="defaultTaken">\${true}</camunda:outputParameter>
              </camunda:inputOutput>
            </extensionElements>
          </exclusiveGateway>
          <endEvent id="end" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
          <sequenceFlow id="flow2" sourceRef="task" targetRef="decision" />
          <sequenceFlow id="flow3" sourceRef="decision" targetRef="task" />
          <sequenceFlow id="flow4" sourceRef="decision" targetRef="end">
            <conditionExpression xsi:type="tFormalExpression">\${variables.defaultTaken}</conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      const engine = new Engine({
        source: processXml,
        moddleOptions
      });

      const listener = new EventEmitter();
      let startCount = 0;
      listener.on('start-task', (activity) => {
        startCount++;
        if (startCount > 2) {
          fail(`<${activity.id}> Too many starts`);
        }
      });
      listener.on('wait-task', (activityApi) => {
        activityApi.signal(activityApi.getInput().input);
      });
      let endEventCount = 0;
      listener.on('start-end', () => {
        endEventCount++;
      });

      engine.execute({
        listener,
        variables: {
          test: 1
        }
      });
      engine.once('end', (def) => {
        expect(def.getOutput()).to.equal({
          defaultTaken: true,
          taskOutput: true
        });

        expect(startCount, 'task starts').to.equal(2);
        expect(endEventCount, 'end event').to.equal(1);
        testHelpers.expectNoLingeringListenersOnEngine(engine);
        done();
      });
    });

    it('user signal input is stored with process', (done) => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="theStart" />
          <userTask id="task" />
          <endEvent id="theEnd" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="task" />
          <sequenceFlow id="flow2" sourceRef="task" targetRef="theEnd" />
        </process>
      </definitions>`;
      const engine = new Engine({
        source
      });
      const listener = new EventEmitter();

      listener.once('wait-task', (activityApi) => {
        activityApi.signal('Pål');
      });

      engine.execute({
        listener
      }, (err) => {
        if (err) return done(err);
      });

      engine.on('end', (execution) => {
        expect(execution.getOutput().taskInput.task).to.equal('Pål');
        done();
      });
    });

    it('but not if signal is called without input', (done) => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="theStart" />
          <userTask id="task" />
          <endEvent id="theEnd" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="task" />
          <sequenceFlow id="flow2" sourceRef="task" targetRef="theEnd" />
        </process>
      </definitions>`;
      const engine = new Engine({
        source
      });
      const listener = new EventEmitter();

      listener.once('wait-task', (activityApi) => {
        activityApi.signal();
      });

      engine.execute({
        listener: listener
      }, (err) => {
        if (err) return done(err);
      });

      engine.on('end', (execution) => {
        expect(execution.getOutput().taskInput).to.be.undefined();
        done();
      });
    });
  });

  describe('with form', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <userTask id="task">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="formfield1" label="FormField1" type="string" />
              <camunda:formField id="formfield2" type="long" />
            </camunda:formData>
          </extensionElements>
          </userTask>
        <endEvent id="end" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
        <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
      </process>
    </definitions>`;

    it('requires signal to complete', (done) => {
      const listener = new EventEmitter();

      listener.once('wait-task', (activityApi) => {
        expect(activityApi.getState().waiting).to.be.true();
        activityApi.signal({
          formfield1: 1,
          formfield2: 2
        });
      });

      const engine = new Engine({
        source,
        moddleOptions
      });

      engine.once('end', () => {
        done();
      });

      engine.execute({
        listener: listener
      });
    });

    it('getState() returns waiting true', (done) => {
      const engine = new Engine({
        source,
        moddleOptions
      });

      const listener = new EventEmitter();
      listener.once('wait-task', (event) => {
        engine.stop();
        expect(event.getState()).to.include({ waiting: true });
        done();
      });

      engine.execute({
        listener: listener
      });
    });

    it('getState() returns form state', (done) => {
      const engine = new Engine({
        source,
        moddleOptions
      });

      const listener = new EventEmitter();
      listener.once('wait-task', (event) => {
        engine.stop();
        const state = event.getState();
        expect(state.io).to.include(['form']);
        expect(state.io.form).to.include(['fields']);
        done();
      });

      engine.execute({
        listener: listener
      });
    });
  });

  describe('loop', () => {
    describe('sequential', () => {
      let context;
      beforeEach((done) => {
        getLoopContext(true, (err, result) => {
          if (err) return done(err);
          context = result;
          done();
        });
      });

      it('emits wait with the same id', (done) => {
        const task = context.getChildActivityById('task');
        task.activate();

        const waits = [];
        task.on('wait', (activityApi, executionContext) => {
          if (waits.length > 5) fail('too many waits');
          waits.push(executionContext.id);

          const api = activityApi.getApi(executionContext);
          api.form.setFieldValue('yay', true);

          executionContext.signal();
        });
        task.on('end', (activityApi, executionContext) => {
          if (executionContext.isLoopContext) return;

          expect(waits).to.equal(['task', 'task', 'task']);
          done();
        });

        task.run();
      });

      it('assigns input to form', (done) => {
        const task = context.getChildActivityById('task');
        task.activate();

        task.on('wait', (activityApi, executionContext) => {

          const input = executionContext.getInput();
          const form = executionContext.getForm();

          form.setFieldValue('yay', input.index < 2);

          executionContext.signal();
        });

        task.on('end', (activityApi, executionContext) => {
          if (executionContext.isLoopContext) return;

          expect(executionContext.getOutput().result).to.equal([{
            email: 'pal@example.com',
            yay: true
          }, {
            email: 'franz@example.com',
            yay: true
          }, {
            email: 'immanuel@example.com',
            yay: false
          }]);
          done();
        });

        task.run();
      });

      it('resume resumes incomple executions', (done) => {
        const task = context.getChildActivityById('task');

        let count = 0, state, taskApi;
        task.once('enter', (activityApi, executionContext) => {
          taskApi = activityApi.getApi(executionContext);
        });

        task.on('wait', (activityApi, executionContext) => {
          const input = executionContext.getInput();
          const form = executionContext.getForm();

          form.setFieldValue('yay', input.index < 2);

          executionContext.signal(form.getOutput());
        });

        task.on('start', function startEH() {
          ++count;

          if (count < 2) return;
          task.removeListener('start', startEH);

          state = taskApi.getState();

          taskApi.stop();

          task.on('start', () => {
            ++count;
            if (count > 4) fail('Too many starts');
          });
          task.on('leave', (activityApi, executionContext) => {
            expect(executionContext.getOutput().result).to.equal([{
              email: 'pal@example.com',
              yay: true
            }, {
              email: 'franz@example.com',
              yay: true
            }, {
              email: 'immanuel@example.com',
              yay: false
            }]);
            done();
          });

          task.activate(state).resume();
        });

        task.activate().run();
      });

    });

    describe('parallell', () => {
      let context;
      beforeEach((done) => {
        getLoopContext(false, (err, result) => {
          if (err) return done(err);
          context = result;
          done();
        });
      });

      it('emits wait with different ids', (done) => {
        const task = context.getChildActivityById('task');
        task.activate();

        const starts = [];
        const waits = [];
        task.on('wait', (activityApi, executionContext) => {
          if (waits.length > 5) fail('too many waits');

          starts.push(executionContext);
          waits.push(executionContext.id);

          const api = activityApi.getApi(executionContext);
          api.form.setFieldValue('yay', true);

          if (starts.length === 3) {
            starts.reverse().forEach((t) => t.signal());
          }
        });
        task.on('end', (activityApi, executionContext) => {
          if (executionContext.isLoopContext) return;

          expect(waits).to.have.length(3);
          waits.forEach((id) => expect(id).to.match(/^task_/i));
          expect(waits.includes(task.id), 'unique task id').to.be.false();
          done();
        });

        task.run();
      });

      it('assigns input to form', (done) => {
        const task = context.getChildActivityById('task');
        task.activate();

        task.on('wait', (activityApi, executionContext) => {
          const input = executionContext.getInput();
          const form = executionContext.getForm();

          form.setFieldValue('yay', input.index < 2);

          executionContext.signal(form.getOutput());
        });

        task.on('end', (activityApi, executionContext) => {
          if (executionContext.isLoopContext) return;

          expect(executionContext.getOutput().result).to.equal([{
            email: 'pal@example.com',
            yay: true
          }, {
            email: 'franz@example.com',
            yay: true
          }, {
            email: 'immanuel@example.com',
            yay: false
          }]);
          done();
        });

        task.run();
      });
    });
  });
});

function getLoopContext(sequential, callback) {
  const source = `
  <?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
    <process id="parallellLoopProcess" isExecutable="true">
      <userTask id="task">
        <multiInstanceLoopCharacteristics isSequential="${sequential}" camunda:collection="\${variables.boardMembers}">
          <loopCardinality>5</loopCardinality>
        </multiInstanceLoopCharacteristics>
        <extensionElements>
          <camunda:inputOutput>
            <camunda:inputParameter name="email">\${item}</camunda:inputParameter>
            <camunda:inputParameter name="index">\${index}</camunda:inputParameter>
            <camunda:outputParameter name="result">\${result}</camunda:outputParameter>
          </camunda:inputOutput>
          <camunda:formData>
            <camunda:formField id="email" type="string" defaultValue="\${email}" />
            <camunda:formField id="yay" type="boolean" />
          </camunda:formData>
        </extensionElements>
      </userTask>
    </process>
  </definitions>`;
  testHelpers.getContext(source, moddleOptions, (err, context) => {
    if (err) return callback(err);
    context.environment.assignVariables({boardMembers: ['pal@example.com', 'franz@example.com', 'immanuel@example.com']});
    callback(null, context);
  });
}
