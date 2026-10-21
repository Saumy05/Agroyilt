import React from 'react';
import { isChunkLoadError, reloadForNewVersion } from '../../../../utils/chunkReload';
import LogoLoader from '../../../../components/common/LogoLoader';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Worker App Error:', error, errorInfo);
    if (isChunkLoadError(error)) reloadForNewVersion(); // an older tab after a deploy: load the new version
    this.setState({
      error,
      errorInfo,
    });
  }

  render() {
    if (this.state.hasError) {
      return <LogoLoader />;
    }

    return this.props.children;
  }
}
export default ErrorBoundary;

