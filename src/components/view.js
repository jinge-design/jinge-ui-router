import {
  ResolveContext
} from '@uirouter/core';
import {
  instanceOf,
  Symbol,
  isString,
  STR_DEFAULT,
  STR_JINGE,
  STR_EMPTY
} from 'jinge/util';
import {
  createComment,
  getParent,
  insertBefore,
  removeChild
} from 'jinge/dom';
import {
  wrapViewModel
} from 'jinge/viewmodel/proxy';
import {
  Component,
  RENDER,
  DESTROY,
  ROOT_NODES,
  isComponent,
  getFirstHtmlDOM,
  onAfterRender,
  CONTEXT,
  UPDATE_IF_NEED,
  UPDATE
} from 'jinge/core/component';
import {
  UIROUTER,
  UIROUTER_CONTEXT,
  UIROUTER_CONTEXT_PARENT,
  BaseRouter as CoreRouter
} from '../core';

const UIVIEW_RESOLVES = Symbol('resolves');
const UIVIEW_COMPONENT = Symbol('component');
const UIVIEW_DATA = Symbol('data');
const UIVIEW_ADDRESS = Symbol('address');
const UIVIEW_CONFIG_UPDATED = Symbol();
const UIVIEW_deregister = Symbol('deregister');
const TransitionPropCollisionError = new Error(
  '`transition` cannot be used as resolve token. Please rename your resolve to avoid conflicts with the router transition.'
);

const EXCLUDES = ['$transition$','$stateParams', '$state$'];
let AUTO_INC_ID = 0;

function createEl(componentClass, resolves, context) {
  const attrs = {
    [CONTEXT]: context,
  };
  if (resolves) Object.assign(attrs, resolves);
  return new componentClass(wrapViewModel(attrs, true));
}

export class UIView extends Component {
  constructor(attrs) {
    super(attrs);
    const router = this.getContext(UIROUTER_CONTEXT);
    if (!router || !instanceOf(router, CoreRouter)) {
      throw new Error('RouterView must under parent which has context named Router.CONTEXT_NAME');
    }
    this[UIROUTER] = router;
    const parent = this.getContext(UIROUTER_CONTEXT_PARENT) || { fqn: '', context: router.stateRegistry.root() };
    const name = attrs._name || STR_DEFAULT;
    const uiViewData = {
      $type: STR_JINGE,
      id: ++AUTO_INC_ID,
      name: name,
      fqn: parent.fqn ? parent.fqn + '.' + name : name,
      creationContext: parent.context,
      configUpdated: this[UIVIEW_CONFIG_UPDATED].bind(this),
      config: undefined
    };
    const uiViewAddress = {
      fqn: uiViewData.fqn,
      context: undefined
    };
    // if (uiViewData.id === 2) {
    //   console.log(parent.context);
    //   debugger;
    // }
    this.setContext(UIROUTER_CONTEXT_PARENT, uiViewAddress, true);
    this[UIVIEW_COMPONENT] = this[UIVIEW_RESOLVES] = null;
    this[UIVIEW_ADDRESS] = uiViewAddress;
    this[UIVIEW_DATA] = uiViewData;
    this[UIVIEW_deregister] = router.viewService.registerUIView(uiViewData);
  }
  [RENDER]() {
    const roots = this[ROOT_NODES];
    const componentClass = this[UIVIEW_COMPONENT];
    if (!componentClass) {
      roots.push(createComment(STR_EMPTY));
      return roots;
    }
    const el = createEl(componentClass, this[UIVIEW_RESOLVES], this[CONTEXT]);
    roots.push(el);
    return el[RENDER]();
  }
  [UIVIEW_CONFIG_UPDATED](newConfig) {
    // console.log('cfg', newConfig, this[UIVIEW_DATA].id);
    const uiViewData = this[UIVIEW_DATA];
    if (uiViewData.config === newConfig) return;

    // console.log('update:', this[UIVIEW_DATA].id);
    let resolves = null;

    if (newConfig) {
      this[UIVIEW_ADDRESS].context = newConfig.viewDecl && newConfig.viewDecl.$context;
      const resolveContext = new ResolveContext(newConfig.path);
      const injector = resolveContext.injector();

      const stringTokens = resolveContext.getTokens().filter(t => isString(t) && EXCLUDES.indexOf(t) < 0);
      if (stringTokens.indexOf('transition') !== -1) {
        throw TransitionPropCollisionError;
      }

      if (stringTokens.length > 0) {
        resolves = {};
        stringTokens.forEach(token => {
          resolves[token] = injector.get(token);
        });
      }
    }

    uiViewData.config = newConfig;
    this[UIVIEW_COMPONENT] = newConfig && newConfig.viewDecl && newConfig.viewDecl.component;
    this[UIVIEW_RESOLVES] = resolves;
    this[UPDATE_IF_NEED]();
  }
  [UPDATE]() {
    const roots = this[ROOT_NODES];
    const preEl = roots[0];
    const isC = isComponent(preEl);
    const newComponent = this[UIVIEW_COMPONENT];
    if (!newComponent && !isC) {
      return;
    }
    const el = newComponent ? createEl(newComponent, this[UIVIEW_RESOLVES], this[CONTEXT]) : createComment(STR_EMPTY);
    const fd = isC ? getFirstHtmlDOM(preEl) : preEl;
    const pa = getParent(fd);
    insertBefore(
      pa,
      newComponent ? el[RENDER]() : el,
      fd
    );
    if (isC) {
      preEl[DESTROY]();
    } else {
      removeChild(pa, fd);
    }
    roots[0] = el;
    newComponent && onAfterRender(el);
  }
  beforeDestroy() {
    this[UIVIEW_deregister]();
  }
}