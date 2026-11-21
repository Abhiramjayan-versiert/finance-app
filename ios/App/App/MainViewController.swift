import UIKit
import Capacitor

/// FINANCE OS root view controller: enables the standard iOS edge-swipe to go back.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.allowsBackForwardNavigationGestures = true
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
    }
}
